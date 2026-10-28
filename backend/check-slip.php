<?php

header('Content-Type: application/json; charset=utf-8');

// ================================
// ตั้งค่าของ SlipOK
// ================================
$branchId = getenv('SLIPOK_BRANCH_ID') ?: '';
$apiKey = getenv('SLIPOK_API_KEY') ?: '';

// ================================
// รับข้อมูลจาก pos.html
// ================================

session_start();
require __DIR__ . '/db.php';

function failSlip($message, $code = 400) {
    http_response_code($code);
    echo json_encode([
        'success' => false,
        'message' => $message
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if (empty($_SESSION['user_id'])) {
    failSlip('กรุณาเข้าสู่ระบบ', 401);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    failSlip('กรุณาส่งข้อมูลแบบ POST', 405);
}

unset($_SESSION['verified_slip']);

if (empty($branchId) || empty($apiKey)) {
    failSlip('ยังไม่ได้ตั้งค่าการเชื่อมต่อ SlipOK', 500);
}

// ตรวจไฟล์สลิป
if (!isset($_FILES['files'])) {
    failSlip('กรุณาแนบไฟล์สลิป');
}

$file = $_FILES['files'];

if ($file['error'] !== UPLOAD_ERR_OK) {
    failSlip('อัปโหลดสลิปไม่สำเร็จ');
}

if ($file['size'] <= 0 || $file['size'] > 5 * 1024 * 1024) {
    failSlip('ไฟล์สลิปต้องมีขนาดไม่เกิน 5 MB');
}

$mime = (new finfo(FILEINFO_MIME_TYPE))
    ->file($file['tmp_name']);

if (!in_array($mime, [
    'image/jpeg',
    'image/png',
    'image/webp'
], true)) {
    failSlip('ไฟล์สลิปไม่ถูกต้อง');
}

// รับรายการสินค้า
$items = json_decode($_POST['items'] ?? '', true);

if (!is_array($items) || count($items) === 0) {
    failSlip('ไม่พบรายการสินค้า');
}

$qtys = [];

foreach ($items as $item) {
    $id = filter_var(
        $item['id'] ?? null,
        FILTER_VALIDATE_INT
    );
    $qty = filter_var(
        $item['qty'] ?? null,
        FILTER_VALIDATE_INT
    );

    if ($id === false || $id <= 0 ||
        $qty === false || $qty < 1 || $qty > 9999) {
        failSlip('ข้อมูลสินค้าไม่ถูกต้อง');
    }

    $qtys[$id] = ($qtys[$id] ?? 0) + $qty;

    if ($qtys[$id] > 9999) {
        failSlip('จำนวนสินค้ามากเกินกำหนด');
    }
}

ksort($qtys);

// คำนวณยอดจากฐานข้อมูลจริง
try {
    $stmt = $pdo->prepare(
        'SELECT price, stock FROM products WHERE id = ?'
    );

    $total = 0;

    foreach ($qtys as $id => $qty) {
        $stmt->execute([$id]);
        $product = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$product) {
            failSlip('ไม่พบสินค้าในฐานข้อมูล');
        }

        if ((int)$product['stock'] < $qty) {
            failSlip('สินค้าคงเหลือไม่เพียงพอ');
        }

        $total += (float)$product['price'] * $qty;
    }

    $total = round($total, 2);

    if ($total <= 0) {
        failSlip('ยอดชำระไม่ถูกต้อง');
    }

} catch (PDOException $e) {
    failSlip('ไม่สามารถตรวจสอบราคาสินค้าได้', 500);
}

// ส่งสลิปไป SlipOK
if (!function_exists('curl_init')) {
    failSlip('PHP ยังไม่ได้เปิดใช้งาน cURL', 500);
}

$url = 'https://api.slipok.com/api/line/apikey/'
     . rawurlencode((string)$branchId);

$postData = [
    'files' => new CURLFile(
        $file['tmp_name'],
        $mime,
        $file['name']
    ),
    'amount' => number_format($total, 2, '.', ''),
    'log' => 'true'
];

$ch = curl_init($url);

curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $postData,
    CURLOPT_HTTPHEADER => [
        'x-authorization: ' . $apiKey
    ],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 30
]);

$response = curl_exec($ch);
$curlError = curl_error($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);


if ($response === false) {
    failSlip('เชื่อมต่อ SlipOK ไม่สำเร็จ: ' . $curlError, 502);
}

$result = json_decode($response, true);

if (!is_array($result)) {
    failSlip('SlipOK ส่งข้อมูลตอบกลับไม่ถูกต้อง', 502);
}

if ($httpCode !== 200 ||
    ($result['success'] ?? false) !== true ||
    ($result['data']['success'] ?? false) !== true) {
    failSlip(
        $result['message'] ??
        $result['data']['message'] ??
        'ตรวจสอบสลิปไม่ผ่าน',
        400
    );
}

$slipData = $result['data'];
$ref = trim((string)($slipData['transRef'] ?? ''));

if ($ref === '') {
    failSlip('ไม่พบเลขอ้างอิงธุรกรรม');
}

if (!isset($slipData['amount']) ||
    !is_numeric($slipData['amount']) ||
    round((float)$slipData['amount'], 2) !== $total) {
    failSlip('ยอดเงินในสลิปไม่ตรงกับยอดสินค้า');
}

// ตรวจว่ามีการใช้สลิปนี้ขายไปแล้วหรือไม่
try {
    $stmt = $pdo->prepare(
        'SELECT id FROM orders WHERE slip_trans_ref = ? LIMIT 1'
    );
    $stmt->execute([$ref]);

    if ($stmt->fetch()) {
        failSlip('สลิปนี้ถูกใช้บันทึกยอดขายแล้ว', 409);
    }
} catch (PDOException $e) {
    failSlip('ไม่สามารถตรวจสอบสลิปซ้ำได้', 500);
}

// เก็บหลักฐานยืนยันไว้ฝั่งเซิร์ฟเวอร์
$_SESSION['verified_slip'] = [
    'ref' => $ref,
    'total' => $total,
    'items_hash' => hash(
        'sha256',
        json_encode($qtys)
    ),
    'verified_at' => time()
];

echo json_encode([
    'success' => true,
    'message' => 'ตรวจสอบสลิปสำเร็จ',
    'data' => [
        'transRef' => $ref,
        'amount' => $total
    ]
], JSON_UNESCAPED_UNICODE);

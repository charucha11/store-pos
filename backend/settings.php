<?php
require __DIR__ . '/profile_common.php';

$u = who();
$defaults = [
    'shop_name' => 'ร้านขายของชำ',
    'shop_phone' => '',
    'shop_address' => '',
    'shop_email' => '',
    'receipt_footer' => 'ขอบคุณที่อุดหนุน',
    'receipt_show_phone' => true,
    'receipt_show_address' => true,
    'receipt_show_logo' => false,
    'receipt_logo_url' => '',
    'paper_size' => '80mm',
    'notify_low_stock' => true,
    'notify_sales' => true,
    'confirm_delete' => true,
];

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method === 'GET') {
    try {
        $stmt = $pdo->query('SELECT setting_key, setting_value FROM profile_shop_settings');
        $settings = $defaults;
        foreach ($stmt as $item) {
            $key = $item['setting_key'];
            if (!array_key_exists($key, $defaults)) continue;
            $value = json_decode($item['setting_value'], true);
            if (json_last_error() !== JSON_ERROR_NONE) continue;
            if (is_bool($defaults[$key]) && !is_bool($value)) continue;
            if (is_string($defaults[$key]) && !is_string($value)) continue;
            $settings[$key] = $value;
        }
        respond(200, ['ok' => true, 'settings' => $settings, 'can_edit' => ($u['role'] ?? '') === 'owner']);
    } catch (Throwable $e) {
        error_log('settings GET: ' . $e->getMessage());
        respond(500, ['ok' => false, 'message' => 'โหลดการตั้งค่าไม่สำเร็จ']);
    }
}

if ($method !== 'POST') {
    header('Allow: GET, POST');
    respond(405, ['ok' => false, 'message' => 'ไม่รองรับวิธีการเรียกใช้งานนี้']);
}

// Authorization must be enforced on the server, not only in React.
owner_only($u);
$data = post_guard();
if (!is_array($data) || array_is_list($data)) {
    respond(400, ['ok' => false, 'message' => 'รูปแบบข้อมูลไม่ถูกต้อง']);
}
if (array_diff(array_keys($data), array_keys($defaults))) {
    respond(400, ['ok' => false, 'message' => 'มีการตั้งค่าที่ไม่รองรับ']);
}
$new = array_merge($defaults, $data);

foreach (['shop_name'=>120, 'shop_phone'=>20, 'shop_address'=>300, 'shop_email'=>150, 'receipt_footer'=>250, 'receipt_logo_url'=>500] as $key => $length) {
    if (!is_string($new[$key])) {
        respond(400, ['ok' => false, 'message' => 'ข้อมูล ' . $key . ' ไม่ถูกต้อง']);
    }
    $new[$key] = trim($new[$key]);
    $size = function_exists('mb_strlen') ? mb_strlen($new[$key], 'UTF-8') : strlen($new[$key]);
    if ($size > $length) {
        respond(400, ['ok' => false, 'message' => 'ข้อมูล ' . $key . ' ยาวเกินไป']);
    }
}

if ($new['shop_name'] === '') respond(400, ['ok' => false, 'message' => 'กรุณากรอกชื่อร้าน']);
if ($new['shop_email'] !== '' && !filter_var($new['shop_email'], FILTER_VALIDATE_EMAIL)) respond(400, ['ok' => false, 'message' => 'อีเมลร้านค้าไม่ถูกต้อง']);
if ($new['shop_phone'] !== '' && !preg_match('/^[0-9+()\-\s]{8,20}$/', $new['shop_phone'])) respond(400, ['ok' => false, 'message' => 'เบอร์โทรศัพท์ร้านไม่ถูกต้อง']);
if (!in_array($new['paper_size'], ['58mm', '80mm', 'A4'], true)) respond(400, ['ok' => false, 'message' => 'ขนาดกระดาษไม่รองรับ']);
foreach (['receipt_show_phone', 'receipt_show_address', 'receipt_show_logo', 'notify_low_stock', 'notify_sales', 'confirm_delete'] as $key) {
    if (!is_bool($new[$key])) respond(400, ['ok' => false, 'message' => 'ข้อมูล ' . $key . ' ต้องเป็น true หรือ false']);
}
if ($new['receipt_logo_url'] !== '') {
    $url = filter_var($new['receipt_logo_url'], FILTER_VALIDATE_URL);
    $scheme = $url ? strtolower((string) parse_url($new['receipt_logo_url'], PHP_URL_SCHEME)) : '';
    if (!$url || $scheme !== 'https') respond(400, ['ok' => false, 'message' => 'โลโก้ต้องเป็น URL แบบ HTTPS']);
}

try {
    $pdo->beginTransaction();
    $stmt = $pdo->prepare('INSERT INTO profile_shop_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)');
    foreach ($new as $key => $value) {
        $stmt->execute([$key, json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)]);
    }
    log_action($u, 'settings_updated', 'อัปเดตข้อมูลร้าน ใบเสร็จ และการตั้งค่าระบบ');
    $pdo->commit();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) $pdo->rollBack();
    error_log('settings POST: ' . $e->getMessage());
    respond(500, ['ok' => false, 'message' => 'บันทึกการตั้งค่าไม่สำเร็จ']);
}
respond(200, ['ok' => true, 'settings' => $new, 'message' => 'บันทึกการตั้งค่าแล้ว']);

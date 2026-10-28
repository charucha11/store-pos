
<?php
session_start();
require __DIR__ . '/db.php';

header('Content-Type: application/json; charset=utf-8');

function out($data, $code = 200) {
    global $pdo;

    if ($pdo instanceof PDO && $pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if (empty($_SESSION['user_id'])) {
    out(['ok' => false, 'message' => 'กรุณาเข้าสู่ระบบ'], 401);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    out(['ok' => false, 'message' => 'ไม่รองรับคำขอนี้'], 405);
}

$in = json_decode(file_get_contents('php://input'), true);

if (!is_array($in)) {
    out(['ok' => false, 'message' => 'ข้อมูล JSON ไม่ถูกต้อง'], 400);
}

$method = $in['method'] ?? '';
$items = $in['items'] ?? [];
$ref = $in['ref'] ?? null;

if (!in_array($method, ['cash', 'qr'], true)) {
    out(['ok' => false, 'message' => 'วิธีชำระเงินไม่ถูกต้อง'], 400);
}

if (!is_array($items) || count($items) === 0) {
    out(['ok' => false, 'message' => 'ไม่มีสินค้าในรายการ'], 400);
}

// ตรวจสอบและรวมจำนวนสินค้าชนิดเดียวกัน
$qtys = [];

foreach ($items as $item) {
    if (!is_array($item)) {
        out(['ok' => false, 'message' => 'ข้อมูลสินค้าไม่ถูกต้อง'], 400);
    }

    $id = filter_var(
        $item['id'] ?? null,
        FILTER_VALIDATE_INT
    );

    $qty = filter_var(
        $item['qty'] ?? null,
        FILTER_VALIDATE_INT
    );

    if (
        $id === false || $id === null || $id <= 0 ||
        $qty === false || $qty === null || $qty < 1 || $qty > 9999
    ) {
        out(['ok' => false, 'message' => 'ข้อมูลสินค้าไม่ถูกต้อง'], 400);
    }

    $qtys[$id] = ($qtys[$id] ?? 0) + $qty;

    if ($qtys[$id] > 9999) {
        out(['ok' => false, 'message' => 'จำนวนสินค้ามากเกินกำหนด'], 400);
    }
}

ksort($qtys);

// ตรวจสอบหลักฐาน SlipOK สำหรับ QR
if ($method === 'qr') {
    if (!is_string($ref) || trim($ref) === '') {
        out(['ok' => false, 'message' => 'ไม่พบเลขอ้างอิงสลิป'], 400);
    }

    $ref = trim($ref);
    $verified = $_SESSION['verified_slip'] ?? null;

    if (!is_array($verified)) {
        out([
            'ok' => false,
            'message' => 'กรุณาตรวจสอบสลิปผ่าน SlipOK ก่อน'
        ], 403);
    }

    $verifiedAt = (int)($verified['verified_at'] ?? 0);

    if (
        $verifiedAt <= 0 ||
        $verifiedAt > time() ||
        time() - $verifiedAt > 300
    ) {
        unset($_SESSION['verified_slip']);

        out([
            'ok' => false,
            'message' => 'ผลตรวจสลิปหมดอายุ กรุณาตรวจใหม่'
        ], 403);
    }

    $itemsHash = hash(
        'sha256',
        json_encode($qtys)
    );

    if (
        empty($verified['ref']) ||
        !hash_equals((string)$verified['ref'], $ref) ||
        !hash_equals(
            (string)($verified['items_hash'] ?? ''),
            $itemsHash
        )
    ) {
        out([
            'ok' => false,
            'message' => 'ข้อมูลการขายไม่ตรงกับสลิปที่ตรวจสอบ'
        ], 403);
    }
} else {
    $ref = null;
}

try {
    $pdo->beginTransaction();

    $sel = $pdo->prepare(
        'SELECT id, name, price, stock
         FROM products
         WHERE id = ?
         FOR UPDATE'
    );

    $total = 0;
    $lines = [];

    foreach ($qtys as $id => $qty) {
        $sel->execute([$id]);
        $product = $sel->fetch(PDO::FETCH_ASSOC);

        if (!$product) {
            out([
                'ok' => false,
                'message' => 'ไม่พบสินค้าในระบบ'
            ], 404);
        }

        if ((int)$product['stock'] < $qty) {
            out([
                'ok' => false,
                'message' => 'สินค้า "' . $product['name'] .
                    '" คงเหลือไม่เพียงพอ'
            ], 409);
        }

        $total += (float)$product['price'] * $qty;

        $lines[] = [
            'id' => $id,
            'qty' => $qty,
            'price' => $product['price']
        ];
    }

    $total = round($total, 2);

    if ($total <= 0) {
        out([
            'ok' => false,
            'message' => 'ยอดขายไม่ถูกต้อง'
        ], 400);
    }

    // ตรวจยอดเงินกับผลยืนยัน SlipOK
    if ($method === 'qr') {
        if (
            !isset($verified['total']) ||
            !is_numeric($verified['total']) ||
            round((float)$verified['total'], 2) !== $total
        ) {
            out([
                'ok' => false,
                'message' => 'ยอดขายไม่ตรงกับยอดสลิป'
            ], 409);
        }

        // ตรวจเลขอ้างอิงที่ใช้ไปแล้ว
        $checkRef = $pdo->prepare(
            'SELECT id
             FROM orders
             WHERE slip_trans_ref = ?
             LIMIT 1'
        );

        $checkRef->execute([$ref]);

        if ($checkRef->fetch()) {
            unset($_SESSION['verified_slip']);

            out([
                'ok' => false,
                'message' => 'สลิปนี้ถูกใช้บันทึกการขายแล้ว'
            ], 409);
        }
    }

    $change = null;

    if ($method === 'cash') {
        $cashInput = $in['cash'] ?? null;

        if (
            !is_numeric($cashInput) ||
            (float)$cashInput < 0 ||
            !is_finite((float)$cashInput)
        ) {
            out([
                'ok' => false,
                'message' => 'จำนวนเงินสดไม่ถูกต้อง'
            ], 400);
        }

        $cash = round((float)$cashInput, 2);

        if ($cash < $total) {
            out([
                'ok' => false,
                'message' => 'เงินที่รับมาไม่เพียงพอ'
            ], 400);
        }

        $change = round($cash - $total, 2);
    }

    // บันทึกคำสั่งซื้อ
    $insertOrder = $pdo->prepare(
        'INSERT INTO orders
         (user_id, total, payment_method, slip_trans_ref)
         VALUES (?, ?, ?, ?)'
    );

    $insertOrder->execute([
        $_SESSION['user_id'],
        $total,
        $method,
        $ref
    ]);

    $orderId = (int)$pdo->lastInsertId();

    // บันทึกรายการสินค้าและตัดสต็อก
    $insertItem = $pdo->prepare(
        'INSERT INTO order_items
         (order_id, product_id, quantity, price)
         VALUES (?, ?, ?, ?)'
    );

    $updateStock = $pdo->prepare(
        'UPDATE products
         SET stock = stock - ?
         WHERE id = ?'
    );

    foreach ($lines as $line) {
        $insertItem->execute([
            $orderId,
            $line['id'],
            $line['qty'],
            $line['price']
        ]);

        $updateStock->execute([
            $line['qty'],
            $line['id']
        ]);
    }

    $pdo->commit();

    // ใช้ผลยืนยันสลิปได้เพียงหนึ่งคำสั่งซื้อ
    if ($method === 'qr') {
        unset($_SESSION['verified_slip']);
    }

    echo json_encode([
        'ok' => true,
        'order_id' => $orderId,
        'total' => $total,
        'change' => $change
    ], JSON_UNESCAPED_UNICODE);

} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    error_log('save-order.php: ' . $e->getMessage());

    if (
        $e instanceof PDOException &&
        $e->getCode() === '23000'
    ) {
        out([
            'ok' => false,
            'message' => 'ข้อมูลซ้ำหรือไม่ผ่านข้อกำหนดฐานข้อมูล'
        ], 409);
    }

    out([
        'ok' => false,
        'message' => 'บันทึกการขายไม่สำเร็จ'
    ], 500);
}

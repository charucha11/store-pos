<?php

// Product API for React POS: list, add, delete, set_stock, stock_in

ini_set('display_errors', '0');

header('Content-Type: application/json; charset=utf-8');

header('Cache-Control: no-store');



function respond(array $data, int $status = 200): void {

    http_response_code($status);

    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);

    exit;

}



try {

    if (session_status() !== PHP_SESSION_ACTIVE) session_start();

    require __DIR__ . '/db.php';

    if (!isset($pdo) || !($pdo instanceof PDO)) throw new RuntimeException('Database unavailable');

    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

} catch (Throwable $e) {

    error_log('products init: ' . $e->getMessage());

    respond(['ok' => false, 'message' => 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ'], 500);

}



if (empty($_SESSION['user_id'])) respond(['ok' => false, 'message' => 'กรุณาเข้าสู่ระบบ'], 401);



function columns(PDO $pdo, string $table): array {

    $allowed = ['products', 'stock_in'];

    if (!in_array($table, $allowed, true)) throw new InvalidArgumentException('Invalid table');

    return array_column($pdo->query('SHOW COLUMNS FROM `' . $table . '`')->fetchAll(PDO::FETCH_ASSOC), 'Field');

}



function requireOwner(): void {

    if (($_SESSION['role'] ?? '') !== 'owner') respond(['ok' => false, 'message' => 'เฉพาะเจ้าของร้านเท่านั้น'], 403);

}



// Count Unicode characters without requiring the optional mbstring extension.

function textLength(string $value): int {

    if (function_exists('mb_strlen')) return mb_strlen($value, 'UTF-8');

    $count = preg_match_all('/./us', $value);

    return $count === false ? strlen($value) : $count;

}



function positiveId($value): int {

    $id = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);

    if ($id === false) respond(['ok' => false, 'message' => 'รหัสสินค้าไม่ถูกต้อง'], 422);

    return (int)$id;

}



function quantityValue($value, bool $positive = false): int {

    $raw = trim((string)$value);

    if (!preg_match('/^\d+$/D', $raw) || strlen($raw) > 7) {

        respond(['ok' => false, 'message' => 'จำนวนสินค้าไม่ถูกต้อง'], 422);

    }

    $qty = (int)$raw;

    if ($qty > 1000000 || ($positive && ($qty < 1 || $qty > 9999))) {

        respond(['ok' => false, 'message' => 'จำนวนสินค้าไม่ถูกต้อง'], 422);

    }

    return $qty;

}



try {

    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'GET') {

        $available = columns($pdo, 'products');

        foreach (['id', 'name', 'price', 'stock'] as $required) {

            if (!in_array($required, $available, true)) throw new RuntimeException('Missing products column: ' . $required);

        }

        $select = ['id', 'name', 'price', 'stock'];

        foreach (['code', 'barcode', 'category', 'image'] as $field) {

            $select[] = in_array($field, $available, true) ? '`' . $field . '`' : "'' AS `" . $field . "`";

        }

        $rows = $pdo->query('SELECT ' . implode(', ', $select) . ' FROM products ORDER BY id DESC')->fetchAll(PDO::FETCH_ASSOC);

        foreach ($rows as &$row) {

            $row['id'] = (int)$row['id'];

            $row['price'] = (float)$row['price'];

            $row['stock'] = (int)$row['stock'];

        }

        unset($row);

        respond(['ok' => true, 'products' => $rows]);

    }



    if ($method !== 'POST') {

        header('Allow: GET, POST');

        respond(['ok' => false, 'message' => 'Method not allowed'], 405);

    }

    requireOwner();

    $action = trim((string)($_POST['action'] ?? ''));

    $available = columns($pdo, 'products');



    if ($action === 'add') {

        $code = trim((string)($_POST['code'] ?? ''));

        $barcode = trim((string)($_POST['barcode'] ?? ''));

        $name = trim((string)($_POST['name'] ?? ''));

        $category = trim((string)($_POST['category'] ?? ''));

        $priceRaw = trim((string)($_POST['price'] ?? ''));

        $stockRaw = (string)($_POST['stock'] ?? '');

        if ($code === '' || $name === '' || $category === '' || !is_numeric($priceRaw) || !is_finite((float)$priceRaw) || (float)$priceRaw < 0 || (float)$priceRaw > 100000000) {

            respond(['ok' => false, 'message' => 'ข้อมูลสินค้าไม่ถูกต้อง'], 422);

        }

        $stock = quantityValue($stockRaw);

        if (textLength($code) > 100 || textLength($name) > 255 || textLength($category) > 100 || textLength($barcode) > 100) {

            respond(['ok' => false, 'message' => 'ข้อมูลสินค้ายาวเกินไป'], 422);

        }

        $data = ['name' => $name, 'price' => (float)$priceRaw, 'stock' => $stock];

        foreach (['code' => $code, 'barcode' => $barcode, 'category' => $category] as $key => $value) {

            if (in_array($key, $available, true)) $data[$key] = $value;

        }

        $savedPath = null;

        if (isset($_FILES['image']) && $_FILES['image']['error'] !== UPLOAD_ERR_NO_FILE) {

            $file = $_FILES['image'];

            if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > 2 * 1024 * 1024 || $file['size'] <= 0) {

                respond(['ok' => false, 'message' => 'อัปโหลดรูปไม่สำเร็จหรือรูปใหญ่เกิน 2 MB'], 422);

            }

            if (!in_array('image', $available, true)) respond(['ok' => false, 'message' => 'ตาราง products ไม่มีคอลัมน์ image'], 422);

            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);

            $exts = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];

            if (!isset($exts[$mime]) || @getimagesize($file['tmp_name']) === false) respond(['ok' => false, 'message' => 'รองรับเฉพาะรูป JPG PNG WEBP GIF'], 422);

            $dir = __DIR__ . '/uploads/products';

            if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) throw new RuntimeException('Cannot create upload directory');

            $filename = bin2hex(random_bytes(16)) . '.' . $exts[$mime];

            $target = $dir . '/' . $filename;

            if (!move_uploaded_file($file['tmp_name'], $target)) throw new RuntimeException('Cannot save uploaded image');

            $savedPath = $target;

            $data['image'] = 'uploads/products/' . $filename;

        }

        try {

            $fields = array_keys($data);

            $sql = 'INSERT INTO products (' . implode(', ', array_map(fn($f) => '`' . $f . '`', $fields)) . ') VALUES (' . implode(', ', array_fill(0, count($fields), '?')) . ')';

            $stmt = $pdo->prepare($sql);

            $stmt->execute(array_values($data));

        } catch (Throwable $e) {

            if ($savedPath) @unlink($savedPath);

            throw $e;

        }

        respond(['ok' => true, 'id' => (int)$pdo->lastInsertId(), 'message' => 'เพิ่มสินค้าเรียบร้อย']);

    }



    if ($action === 'update') {

        $id = positiveId($_POST['id'] ?? null);

        $code = trim((string)($_POST['code'] ?? ''));

        $barcode = trim((string)($_POST['barcode'] ?? ''));

        $name = trim((string)($_POST['name'] ?? ''));

        $category = trim((string)($_POST['category'] ?? ''));

        $priceRaw = trim((string)($_POST['price'] ?? ''));



        if ($code === '' || $name === '' || $category === '' ||

            !is_numeric($priceRaw) || !is_finite((float)$priceRaw) ||

            (float)$priceRaw < 0 || (float)$priceRaw > 100000000) {

            respond(['ok' => false, 'message' => 'ข้อมูลสินค้าไม่ถูกต้อง'], 422);

        }

        if (textLength($code) > 20 || textLength($barcode) > 50 ||

            textLength($name) > 150 || textLength($category) > 50) {

            respond(['ok' => false, 'message' => 'ข้อมูลสินค้ายาวเกินไป'], 422);

        }



        $stmt = $pdo->prepare('SELECT id FROM products WHERE id = ?');

        $stmt->execute([$id]);

        if (!$stmt->fetchColumn()) respond(['ok' => false, 'message' => 'ไม่พบสินค้า'], 404);



        $data = [

            'code' => $code, 'barcode' => $barcode !== '' ? $barcode : null,

            'name' => $name, 'category' => $category, 'price' => (float)$priceRaw,

        ];

        $savedPath = null;

        if (isset($_FILES['image']) && $_FILES['image']['error'] !== UPLOAD_ERR_NO_FILE) {

            $file = $_FILES['image'];

            if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] <= 0 || $file['size'] > 2 * 1024 * 1024) {

                respond(['ok' => false, 'message' => 'อัปโหลดรูปไม่สำเร็จหรือรูปใหญ่เกิน 2 MB'], 422);

            }

            $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);

            $exts = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'];

            if (!isset($exts[$mime]) || @getimagesize($file['tmp_name']) === false) {

                respond(['ok' => false, 'message' => 'รองรับเฉพาะรูป JPG PNG WEBP GIF'], 422);

            }

            $dir = __DIR__ . '/uploads/products';

            if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) {

                throw new RuntimeException('Cannot create upload directory');

            }

            $filename = bin2hex(random_bytes(16)) . '.' . $exts[$mime];

            $savedPath = $dir . '/' . $filename;

            if (!move_uploaded_file($file['tmp_name'], $savedPath)) throw new RuntimeException('Cannot save uploaded image');

            $data['image'] = 'uploads/products/' . $filename;

        }

        try {

            $assignments = implode(', ', array_map(fn($key) => '`' . $key . '` = ?', array_keys($data)));

            $stmt = $pdo->prepare('UPDATE products SET ' . $assignments . ' WHERE id = ?');

            $stmt->execute([...array_values($data), $id]);

        } catch (Throwable $e) {

            if ($savedPath) @unlink($savedPath);

            throw $e;

        }

        respond(['ok' => true, 'message' => 'แก้ไขสินค้าเรียบร้อย']);

    }









    if ($action === 'delete') {

        $id = positiveId($_POST['id'] ?? null);

        $stmt = $pdo->prepare('DELETE FROM products WHERE id = ?');

        $stmt->execute([$id]);

        if (!$stmt->rowCount()) respond(['ok' => false, 'message' => 'ไม่พบสินค้า'], 404);

        respond(['ok' => true, 'message' => 'ลบสินค้าเรียบร้อย']);

    }



    if ($action === 'set_stock' || $action === 'stock_in') {

        $id = positiveId($_POST['id'] ?? null);

        $qty = quantityValue($action === 'stock_in' ? ($_POST['quantity'] ?? '') : ($_POST['stock'] ?? ''), $action === 'stock_in');

        $note = trim((string)($_POST['note'] ?? ''));

        if ($action === 'stock_in' && textLength($note) > 255) respond(['ok' => false, 'message' => 'หมายเหตุยาวเกิน 255 ตัวอักษร'], 422);



        $pdo->beginTransaction();

        try {

            $stmt = $pdo->prepare('SELECT stock FROM products WHERE id = ? FOR UPDATE');

            $stmt->execute([$id]);

            $previous = $stmt->fetchColumn();

            $stmt->closeCursor();

            if ($previous === false) {

                $pdo->rollBack();

                respond(['ok' => false, 'message' => 'ไม่พบสินค้า'], 404);

            }

            $after = $action === 'stock_in' ? (int)$previous + $qty : $qty;

            if ($after > 1000000) {

                $pdo->rollBack();

                respond(['ok' => false, 'message' => 'จำนวนสต็อกเกินขีดจำกัด'], 422);

            }

            $update = $pdo->prepare('UPDATE products SET stock = ? WHERE id = ?');

            $update->execute([$after, $id]);



            if ($action === 'stock_in') {

                // Required stock_in schema: id, product_id, quantity, note, user_id, created_at

                $historyColumns = columns($pdo, 'stock_in');

                foreach (['product_id', 'quantity'] as $required) {

                    if (!in_array($required, $historyColumns, true)) throw new RuntimeException('Missing stock_in column: ' . $required);

                }

                $history = ['product_id' => $id, 'quantity' => $qty];

                if (in_array('note', $historyColumns, true)) $history['note'] = $note !== '' ? $note : null;

                if (in_array('user_id', $historyColumns, true)) $history['user_id'] = (int)$_SESSION['user_id'];

                $fields = array_keys($history);

                $sql = 'INSERT INTO stock_in (' . implode(', ', array_map(fn($f) => '`' . $f . '`', $fields)) . ') VALUES (' . implode(', ', array_fill(0, count($fields), '?')) . ')';

                $insert = $pdo->prepare($sql);

                $insert->execute(array_values($history));

            }

            $pdo->commit();

            respond(['ok' => true, 'stock_after' => $after, 'message' => $action === 'stock_in' ? 'รับสินค้าเข้าสต็อกเรียบร้อย' : 'บันทึกสต็อกเรียบร้อย']);

        } catch (Throwable $e) {

            if ($pdo->inTransaction()) $pdo->rollBack();

            throw $e;

        }

    }

    respond(['ok' => false, 'message' => 'ไม่รู้จักคำสั่ง'], 400);

} catch (PDOException $e) {

    error_log('products database: ' . $e->getMessage());

    $status = (string)$e->getCode() === '23000' ? 409 : 500;

    respond(['ok' => false, 'message' => $status === 409 ? 'ข้อมูลซ้ำ หรือข้อมูลถูกใช้อ้างอิงในระบบแล้ว' : 'ฐานข้อมูลทำงานผิดพลาด กรุณาตรวจสอบโครงสร้างตาราง'], $status);

} catch (Throwable $e) {

    error_log('products API: ' . $e->getMessage());

    respond(['ok' => false, 'message' => 'ระบบสินค้าเกิดข้อผิดพลาด'], 500);

}
<?php
// User management API for React POS.
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
require __DIR__ . '/db.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if (empty($_SESSION['user_id'])) {
    out(['ok' => false, 'message' => 'กรุณาเข้าสู่ระบบ'], 401);
}

try {
    $current = $pdo->prepare('SELECT id, role, password_hash FROM users WHERE id = ?');
    $current->execute([(int) $_SESSION['user_id']]);
    $actor = $current->fetch(PDO::FETCH_ASSOC);
} catch (Throwable $e) {
    error_log('users.php actor lookup: ' . $e->getMessage());
    out(['ok' => false, 'message' => 'ตรวจสอบสิทธิ์ผู้ใช้ไม่สำเร็จ'], 500);
}
if (!$actor) {
    out(['ok' => false, 'message' => 'ไม่พบบัญชีผู้ใช้งาน กรุณาเข้าสู่ระบบใหม่'], 401);
}
$isOwner = $actor['role'] === 'owner';
$isStaff = $actor['role'] === 'staff';
if (!$isOwner && !$isStaff) {
    out(['ok' => false, 'message' => 'ไม่มีสิทธิ์ใช้งานส่วนนี้'], 403);
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    try {
        $rows = $pdo->query(
            "SELECT id, username, full_name, phone, role FROM users ORDER BY role = 'owner' DESC, id"
        )->fetchAll(PDO::FETCH_ASSOC);
        out(['ok' => true, 'users' => $rows]);
    } catch (Throwable $e) {
        error_log('users.php list: ' . $e->getMessage());
        out(['ok' => false, 'message' => 'โหลดรายชื่อผู้ใช้งานไม่สำเร็จ'], 500);
    }
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    header('Allow: GET, POST');
    out(['ok' => false, 'message' => 'Method not allowed'], 405);
}

$action = $_POST['action'] ?? '';

if ($action === 'add') {
    if (!$isOwner) {
        out(['ok' => false, 'message' => 'เฉพาะเจ้าของร้านเท่านั้นที่เพิ่มผู้ใช้งานได้'], 403);
    }
    $username = trim((string) ($_POST['username'] ?? ''));
    $password = (string) ($_POST['password'] ?? '');
    $fullName = trim((string) ($_POST['full_name'] ?? ''));
    $phone = preg_replace('/\D/', '', (string) ($_POST['phone'] ?? ''));
    $role = (string) ($_POST['role'] ?? '');

    if (!preg_match('/^[A-Za-z0-9_.-]{3,50}$/', $username)) {
        out(['ok' => false, 'message' => 'ชื่อผู้ใช้ต้องเป็นตัวอักษรอังกฤษ ตัวเลข _ . - ยาว 3-50 ตัว'], 400);
    }
    if ($fullName === '' || strlen($fullName) > 300) {
        out(['ok' => false, 'message' => 'กรุณากรอกชื่อ-นามสกุลที่ถูกต้อง'], 400);
    }
    if (!preg_match('/^[0-9]{10}$/', $phone)) {
        out(['ok' => false, 'message' => 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก'], 400);
    }
    if (strlen($password) < 6) {
        out(['ok' => false, 'message' => 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'], 400);
    }
    if (!in_array($role, ['owner', 'staff'], true)) {
        out(['ok' => false, 'message' => 'บทบาทไม่ถูกต้อง'], 400);
    }

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO users (username, password_hash, full_name, phone, role) VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$username, password_hash($password, PASSWORD_DEFAULT), $fullName, $phone, $role]);
        out(['ok' => true, 'message' => 'เพิ่มผู้ใช้งานเรียบร้อยแล้ว']);
    } catch (PDOException $e) {
        if ($e->getCode() === '23000') {
            out(['ok' => false, 'message' => 'ชื่อผู้ใช้นี้มีอยู่แล้ว'], 409);
        }
        error_log('users.php add: ' . $e->getMessage());
        out(['ok' => false, 'message' => 'เพิ่มผู้ใช้ไม่สำเร็จ'], 500);
    }
}

if ($action === 'delete') {
    // Enforce authorization on the server, not just in React.
    if (!$isOwner) {
        out(['ok' => false, 'message' => 'เฉพาะเจ้าของร้านเท่านั้นที่ลบผู้ใช้งานได้'], 403);
    }
    $id = filter_var($_POST['id'] ?? null, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    if ($id === false || $id === null) {
        out(['ok' => false, 'message' => 'รหัสผู้ใช้ไม่ถูกต้อง'], 400);
    }
    if ((int) $id === (int) $actor['id']) {
        out(['ok' => false, 'message' => 'ไม่สามารถลบบัญชีที่กำลังใช้งานอยู่ได้'], 403);
    }

    $password = (string) ($_POST['confirm_password'] ?? '');
    if ($password === '' || !password_verify($password, $actor['password_hash'])) {
        out(['ok' => false, 'message' => 'รหัสผ่านยืนยันไม่ถูกต้อง'], 403);
    }

    try {
        $stmt = $pdo->prepare("DELETE FROM users WHERE id = ? AND role = 'staff'");
        $stmt->execute([(int) $id]);
        if ($stmt->rowCount() === 1) {
            out(['ok' => true, 'message' => 'ลบผู้ใช้งานเรียบร้อยแล้ว']);
        }
        $check = $pdo->prepare('SELECT role FROM users WHERE id = ?');
        $check->execute([(int) $id]);
        $targetRole = $check->fetchColumn();
        if ($targetRole === false) {
            out(['ok' => false, 'message' => 'ไม่พบผู้ใช้งาน'], 404);
        }
        out(['ok' => false, 'message' => 'ไม่สามารถลบเจ้าของร้านได้'], 403);
    } catch (PDOException $e) {
        error_log('users.php delete: ' . $e->getMessage());
        out(['ok' => false, 'message' => 'ไม่สามารถลบผู้ใช้นี้ได้ อาจมีประวัติการขายหรือข้อมูลอ้างอิงอยู่'], 409);
    }
}

out(['ok' => false, 'message' => 'ไม่รู้จักคำสั่ง'], 400);

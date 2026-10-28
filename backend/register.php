<?php
require 'db.php';
header('Content-Type: application/json; charset=utf-8');

// รหัสยืนยันเจ้าของร้าน (เปลี่ยนเป็นรหัสของคุณเอง)
$OWNER_CODE = 'OWNER2026';

function fail($code, $message) {
  http_response_code($code);
  echo json_encode(['ok' => false, 'message' => $message], JSON_UNESCAPED_UNICODE);
  exit;
}

$fullName      = trim($_POST['full_name'] ?? '');
$username      = trim($_POST['username'] ?? '');
$phone         = trim($_POST['phone'] ?? '');
$password      = $_POST['password'] ?? '';
$role          = $_POST['role'] ?? '';
$ownerPassword = $_POST['owner_password'] ?? '';

if ($fullName === '' || $username === '') fail(400, 'กรุณากรอกข้อมูลให้ครบ');
if (!preg_match('/^[0-9]{10}$/', $phone)) fail(400, 'เบอร์โทรศัพท์ต้องเป็นตัวเลข 10 หลัก');
if (strlen($password) < 6) fail(400, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
if (!in_array($role, ['owner', 'staff'], true)) fail(400, 'กรุณาเลือกประเภทผู้ใช้');

if ($role === 'owner' && !hash_equals($OWNER_CODE, $ownerPassword)) {
  fail(403, 'รหัสยืนยันเจ้าของร้านไม่ถูกต้อง');
}

$check = $pdo->prepare('SELECT id FROM users WHERE username = ?');
$check->execute([$username]);
if ($check->fetch()) fail(409, 'ชื่อผู้ใช้นี้ถูกใช้แล้ว');

$stmt = $pdo->prepare(
  'INSERT INTO users (username, password_hash, full_name, phone, role) VALUES (?, ?, ?, ?, ?)'
);
$stmt->execute([$username, password_hash($password, PASSWORD_DEFAULT), $fullName, $phone, $role]);

echo json_encode(['ok' => true, 'message' => 'สมัครสมาชิกสำเร็จ'], JSON_UNESCAPED_UNICODE);
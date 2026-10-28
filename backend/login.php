<?php
session_start();
require 'db.php';
header('Content-Type: application/json; charset=utf-8');

function fail($code, $message) {
  http_response_code($code);
  echo json_encode(['ok' => false, 'message' => $message], JSON_UNESCAPED_UNICODE);
  exit;
}

$username = trim($_POST['username'] ?? '');
$password = $_POST['password'] ?? '';

if ($username === '' || $password === '') fail(400, 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');

$stmt = $pdo->prepare('SELECT id, username, password_hash, full_name, role FROM users WHERE username = ?');
$stmt->execute([$username]);
$user = $stmt->fetch();

if (!$user || !password_verify($password, $user['password_hash'])) {
  fail(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
}

session_regenerate_id(true);
$_SESSION['user_id']   = $user['id'];
$_SESSION['username']  = $user['username'];
$_SESSION['full_name'] = $user['full_name'];
$_SESSION['role']      = $user['role'];

echo json_encode([
  'ok'        => true,
  'message'   => 'เข้าสู่ระบบสำเร็จ',
  'full_name' => $user['full_name'],
  'role'      => $user['role']
], JSON_UNESCAPED_UNICODE);
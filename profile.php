<?php
session_start();
require __DIR__ . '/db.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
function output($code, $data) {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}
if (!isset($_SESSION['user_id'])) output(401, ['ok'=>false, 'message'=>'กรุณาเข้าสู่ระบบก่อน']);
$id = (int) $_SESSION['user_id'];
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
  if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') === false) output(415, ['ok'=>false, 'message'=>'ต้องส่งข้อมูลรูปแบบ JSON']);
  $data = json_decode(file_get_contents('php://input'), true);
  if (!is_array($data)) output(400, ['ok'=>false, 'message'=>'รูปแบบข้อมูลไม่ถูกต้อง']);
  $name = trim((string)($data['full_name'] ?? ''));
  $phone = preg_replace('/\D/', '', (string)($data['phone'] ?? ''));
  if ($name === '' || strlen($name) > 450) output(400, ['ok'=>false, 'message'=>'กรุณากรอกชื่อ-นามสกุลไม่เกิน 150 ตัวอักษร']);
  if ($phone !== '' && !preg_match('/^\d{10}$/', $phone)) output(400, ['ok'=>false, 'message'=>'เบอร์โทรศัพท์ต้องมี 10 หลัก']);
  try {
    $stmt = $pdo->prepare('UPDATE users SET full_name = ?, phone = ? WHERE id = ?');
    $stmt->execute([$name, $phone, $id]);
    $_SESSION['full_name'] = $name;
  } catch (PDOException $e) {
    output(400, ['ok'=>false, 'message'=>'ไม่สามารถบันทึกได้ โปรดตรวจสอบข้อมูลหรือเบอร์โทรศัพท์ที่ซ้ำกัน']);
  }
} elseif ($_SERVER['REQUEST_METHOD'] !== 'GET') {
  header('Allow: GET, POST');
  output(405, ['ok'=>false, 'message'=>'Method not allowed']);
}
$stmt = $pdo->prepare('SELECT id, username, full_name, phone, role FROM users WHERE id = ? LIMIT 1');
$stmt->execute([$id]);
$user = $stmt->fetch(PDO::FETCH_ASSOC);
if (!$user) output(401, ['ok'=>false, 'message'=>'ไม่พบบัญชีผู้ใช้งาน']);
output(200, ['ok'=>true, 'user'=>$user]);

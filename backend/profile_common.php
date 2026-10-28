<?php
// Shared helpers: include only in authenticated backend endpoints.
if (session_status() !== PHP_SESSION_ACTIVE) session_start();
require_once __DIR__ . '/db.php';
header('Cache-Control: no-store');
function respond($code, $payload) { http_response_code($code); header('Content-Type: application/json; charset=utf-8'); echo json_encode($payload, JSON_UNESCAPED_UNICODE); exit; }
function who() {
  global $pdo;
  if (empty($_SESSION['user_id'])) respond(401, ['ok'=>false,'message'=>'กรุณาเข้าสู่ระบบ']);
  $s=$pdo->prepare('SELECT id,username,role FROM users WHERE id=? LIMIT 1'); $s->execute([(int)$_SESSION['user_id']]); $u=$s->fetch(PDO::FETCH_ASSOC);
  if (!$u) respond(401, ['ok'=>false,'message'=>'ไม่พบบัญชีผู้ใช้งาน']);
  return $u;
}
function owner_only($u) { if (($u['role']??'') !== 'owner') respond(403,['ok'=>false,'message'=>'เฉพาะเจ้าของร้านเท่านั้น']); }
function post_guard() {
  if ($_SERVER['REQUEST_METHOD'] !== 'POST') { header('Allow: POST'); respond(405,['ok'=>false,'message'=>'Method not allowed']); }
  // Browsers send an Origin header for cross-origin-capable requests; reject mismatches.
  $origin=$_SERVER['HTTP_ORIGIN'] ?? '';
  if ($origin !== '') {
    $parts=parse_url($origin); $host=$parts['host'] ?? '';
    $allowed=['localhost','127.0.0.1'];
    if (!in_array($host,$allowed,true) || !in_array((int)($parts['port']??0),[5173,5174,5175,8000],true)) respond(403,['ok'=>false,'message'=>'Origin ไม่ได้รับอนุญาต']);
  }
  if (stripos($_SERVER['CONTENT_TYPE']??'','application/json')===false) respond(415,['ok'=>false,'message'=>'ต้องส่ง JSON']);
  $data=json_decode(file_get_contents('php://input'),true);
  if (!is_array($data)) respond(400,['ok'=>false,'message'=>'JSON ไม่ถูกต้อง']);
  return $data;
}
function log_action($u,$action,$description='') {
  global $pdo;
  $stmt=$pdo->prepare('INSERT INTO profile_audit_log (user_id,username,action,description) VALUES (?,?,?,?)');
  $stmt->execute([(int)$u['id'],$u['username'],$action,$description]);
}

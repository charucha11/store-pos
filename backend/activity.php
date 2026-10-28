<?php
require __DIR__ . '/profile_common.php';
$u=who();
if ($_SERVER['REQUEST_METHOD']!=='GET') respond(405,['ok'=>false,'message'=>'Method not allowed']);
$limit=50;
if ($u['role']==='owner') {
 $stmt=$pdo->query('SELECT username,action,description,created_at FROM profile_audit_log ORDER BY id DESC LIMIT 50');
} else {
 $stmt=$pdo->prepare('SELECT username,action,description,created_at FROM profile_audit_log WHERE user_id=? ORDER BY id DESC LIMIT 50');
 $stmt->execute([(int)$u['id']]);
}
respond(200,['ok'=>true,'events'=>$stmt->fetchAll(PDO::FETCH_ASSOC)]);

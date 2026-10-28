<?php
session_start();
require 'db.php';
header('Content-Type: application/json; charset=utf-8');

function out($data, $code = 200) {
  http_response_code($code);
  echo json_encode($data, JSON_UNESCAPED_UNICODE);
  exit;
}

if (empty($_SESSION['user_id'])) out(['ok' => false, 'message' => 'กรุณาเข้าสู่ระบบ'], 401);
if (($_SESSION['role'] ?? '') !== 'owner') out(['ok' => false, 'message' => 'เฉพาะเจ้าของร้านเท่านั้น'], 403);

/* รายละเอียดบิลเดียว */
if (isset($_GET['order_id'])) {
  $stmt = $pdo->prepare(
    'SELECT o.id, o.total, o.payment_method, o.slip_trans_ref, o.created_at, u.full_name
     FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = ?'
  );
  $stmt->execute([(int)$_GET['order_id']]);
  $order = $stmt->fetch();
  if (!$order) out(['ok' => false, 'message' => 'ไม่พบบิล'], 404);

  $stmt = $pdo->prepare(
    'SELECT p.name, oi.quantity, oi.price
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = ? ORDER BY oi.id'
  );
  $stmt->execute([$order['id']]);
  out(['ok' => true, 'order' => $order, 'items' => $stmt->fetchAll()]);
}

/* รายงานตามช่วงวันที่ */
function validDate($s) {
  $d = DateTime::createFromFormat('Y-m-d', $s);
  return $d && $d->format('Y-m-d') === $s;
}

$start = $_GET['start'] ?? '';
$end   = $_GET['end'] ?? '';
if (!validDate($start) || !validDate($end) || $start > $end) {
  out(['ok' => false, 'message' => 'ช่วงวันที่ไม่ถูกต้อง'], 400);
}

$params = [$start . ' 00:00:00', date('Y-m-d', strtotime($end . ' +1 day')) . ' 00:00:00'];
$where  = 'o.created_at >= ? AND o.created_at < ?';

$q = function ($sql) use ($pdo, $params) {
  $s = $pdo->prepare($sql);
  $s->execute($params);
  return $s;
};

$sum = $q("SELECT COUNT(*) AS orders, COALESCE(SUM(o.total), 0) AS sales
           FROM orders o WHERE $where")->fetch();

$itemsSold = $q("SELECT COALESCE(SUM(oi.quantity), 0)
                 FROM order_items oi JOIN orders o ON o.id = oi.order_id
                 WHERE $where")->fetchColumn();

$daily = $q("SELECT DATE(o.created_at) AS day, SUM(o.total) AS total
             FROM orders o WHERE $where GROUP BY day ORDER BY day")->fetchAll();

$cats = $q("SELECT p.category, SUM(oi.quantity * oi.price) AS sales
            FROM order_items oi
            JOIN orders o ON o.id = oi.order_id
            JOIN products p ON p.id = oi.product_id
            WHERE $where GROUP BY p.category ORDER BY sales DESC")->fetchAll();

$orders = $q("SELECT o.id, o.total, o.payment_method, o.created_at, u.full_name
              FROM orders o LEFT JOIN users u ON u.id = o.user_id
              WHERE $where ORDER BY o.id DESC LIMIT 500")->fetchAll();

out([
  'ok'         => true,
  'total_sales'=> (float)$sum['sales'],
  'total_orders' => (int)$sum['orders'],
  'items_sold' => (int)$itemsSold,
  'daily'      => $daily,
  'categories' => $cats,
  'orders'     => $orders
]);
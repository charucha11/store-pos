<?php
session_start();
require __DIR__ . '/db.php';
header('Content-Type: application/json; charset=utf-8');

if (empty($_SESSION['user_id'])) {
  http_response_code(401);
  echo json_encode(['ok' => false, 'message' => 'กรุณาเข้าสู่ระบบ'], JSON_UNESCAPED_UNICODE);
  exit;
}

$today = $pdo->query('SELECT CURDATE()')->fetchColumn();

/* ยอดขายและจำนวนบิลวันนี้ */
$stmt = $pdo->prepare('SELECT COUNT(*) AS cnt, COALESCE(SUM(total), 0) AS sales FROM orders WHERE DATE(created_at) = ?');
$stmt->execute([$today]);
$t = $stmt->fetch();

/* จำนวนสินค้าในระบบ */
$productCount = (int)$pdo->query('SELECT COUNT(*) FROM products')->fetchColumn();

/* สินค้าใกล้หมด / หมด (เรียงจากน้อยไปมาก) */
$lowStock = $pdo->query('SELECT name, stock FROM products WHERE stock <= 5 ORDER BY stock, name LIMIT 20')->fetchAll();
$lowCount = (int)$pdo->query('SELECT COUNT(*) FROM products WHERE stock > 0 AND stock <= 5')->fetchColumn();
$outCount = (int)$pdo->query('SELECT COUNT(*) FROM products WHERE stock = 0')->fetchColumn();

/* ยอดขาย 7 วันล่าสุด (วันที่ไม่มียอดให้เป็น 0) */
$stmt = $pdo->prepare('SELECT DATE(created_at) AS day, SUM(total) AS total
                       FROM orders
                       WHERE DATE(created_at) >= DATE_SUB(?, INTERVAL 6 DAY)
                       GROUP BY day');
$stmt->execute([$today]);
$byDay = [];
foreach ($stmt->fetchAll() as $r) $byDay[$r['day']] = (float)$r['total'];

$daily = [];
for ($i = 6; $i >= 0; $i--) {
  $d = date('Y-m-d', strtotime($today . " -$i day"));
  $daily[] = ['day' => $d, 'total' => $byDay[$d] ?? 0];
}

/* สินค้าขายดี 5 อันดับ และสัดส่วนหมวดหมู่ (ย้อนหลัง 30 วัน) */
$stmt = $pdo->prepare('SELECT p.name, SUM(oi.quantity) AS qty
                       FROM order_items oi
                       JOIN orders o ON o.id = oi.order_id
                       JOIN products p ON p.id = oi.product_id
                       WHERE DATE(o.created_at) >= DATE_SUB(?, INTERVAL 29 DAY)
                       GROUP BY p.id, p.name ORDER BY qty DESC LIMIT 5');
$stmt->execute([$today]);
$top = $stmt->fetchAll();

$stmt = $pdo->prepare('SELECT p.category, SUM(oi.quantity * oi.price) AS sales
                       FROM order_items oi
                       JOIN orders o ON o.id = oi.order_id
                       JOIN products p ON p.id = oi.product_id
                       WHERE DATE(o.created_at) >= DATE_SUB(?, INTERVAL 29 DAY)
                       GROUP BY p.category ORDER BY sales DESC');
$stmt->execute([$today]);
$cats = $stmt->fetchAll();

echo json_encode([
  'ok'            => true,
  'today_sales'   => (float)$t['sales'],
  'today_orders'  => (int)$t['cnt'],
  'product_count' => $productCount,
  'low_count'     => $lowCount,
  'out_count'     => $outCount,
  'low_stock'     => $lowStock,
  'daily'         => $daily,
  'top_products'  => $top,
  'categories'    => $cats
], JSON_UNESCAPED_UNICODE);
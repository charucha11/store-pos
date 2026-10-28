<?php
// Read-only stock receipt history for the shop owner.
ini_set('display_errors', '0');
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

function stockHistoryResponse(array $data, int $status = 200): void {
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'GET') {
    header('Allow: GET');
    stockHistoryResponse(['ok' => false, 'message' => 'Method not allowed'], 405);
}
if (empty($_SESSION['user_id'])) {
    stockHistoryResponse(['ok' => false, 'message' => 'กรุณาเข้าสู่ระบบ'], 401);
}
if (($_SESSION['role'] ?? '') !== 'owner') {
    stockHistoryResponse(['ok' => false, 'message' => 'เฉพาะเจ้าของร้านเท่านั้น'], 403);
}

try {
    require __DIR__ . '/db.php';
    if (!isset($pdo) || !($pdo instanceof PDO)) {
        throw new RuntimeException('PDO connection unavailable');
    }
    // The products table in this project contains the code column.
    $stmt = $pdo->query(
        'SELECT si.id, si.product_id, si.quantity, si.note, si.user_id,
                DATE_FORMAT(si.created_at, \'%d/%m/%Y %H:%i\') AS created_at,
                p.name AS product_name, p.code AS product_code
         FROM stock_in AS si
         LEFT JOIN products AS p ON p.id = si.product_id
         ORDER BY si.id DESC LIMIT 100'
    );
    $history = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($history as &$item) {
        $item['id'] = (int)$item['id'];
        $item['product_id'] = (int)$item['product_id'];
        $item['quantity'] = (int)$item['quantity'];
        $item['user_id'] = $item['user_id'] === null ? null : (int)$item['user_id'];
    }
    unset($item);
    stockHistoryResponse(['ok' => true, 'history' => $history]);
} catch (Throwable $e) {
    error_log('stock-history.php: ' . $e->getMessage());
    stockHistoryResponse(['ok' => false, 'message' => 'โหลดประวัติรับสินค้าไม่สำเร็จ'], 500);
}

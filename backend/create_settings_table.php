
<?php
require __DIR__ . '/db.php';

try {
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS profile_shop_settings (
            setting_key VARCHAR(100) NOT NULL,
            setting_value TEXT NOT NULL,
            PRIMARY KEY (setting_key)
        ) ENGINE=InnoDB
        DEFAULT CHARSET=utf8mb4
        COLLATE=utf8mb4_unicode_ci
    ");

    echo "SUCCESS: Settings table is ready.";
} catch (PDOException $e) {
    http_response_code(500);
    echo "ERROR: " . $e->getMessage();
}

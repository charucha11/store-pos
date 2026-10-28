<?php
require __DIR__ . '/profile_common.php';
$u=who();
post_guard(); owner_only($u);
// Store backups only for a reasonably-sized development database. They contain sensitive data.
set_time_limit(60);
$tables=$pdo->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
$filename='grocery_backup_'.date('Ymd_His').'.sql';
header('Content-Type: application/sql; charset=utf-8');
header('Content-Disposition: attachment; filename="'.$filename.'"');
header('X-Content-Type-Options: nosniff');
echo "-- Grocery Store database backup (contains sensitive data)\nSET NAMES utf8mb4;\nSET FOREIGN_KEY_CHECKS=0;\n";
foreach ($tables as $table) {
 $safe='`'.str_replace('`','``',$table).'`';
 $create=$pdo->query('SHOW CREATE TABLE '.$safe)->fetch(PDO::FETCH_NUM);
 echo "\nDROP TABLE IF EXISTS ".$safe.";\n".$create[1].";\n";
 $rows=$pdo->query('SELECT * FROM '.$safe);
 while($row=$rows->fetch(PDO::FETCH_ASSOC)) {
   $cols=array_map(fn($c)=>'`'.str_replace('`','``',$c).'`',array_keys($row));
   $values=array_map(fn($v)=>$v===null?'NULL':$pdo->quote((string)$v),array_values($row));
   echo 'INSERT INTO '.$safe.' ('.implode(',',$cols).') VALUES ('.implode(',',$values).');'."\n";
 }
}
echo "SET FOREIGN_KEY_CHECKS=1;\n";

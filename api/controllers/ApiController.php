<?php

declare(strict_types=1);

require_once __DIR__ . '/../core/Response.php';
require_once __DIR__ . '/../core/Router.php';
require_once __DIR__ . '/../inc/ConnDB.php';
require_once __DIR__ . '/EntityController.php';
require_once __DIR__ . '/CategoryController.php';
require_once __DIR__ . '/ProductController.php';
require_once __DIR__ . '/SupplierController.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$isHttps = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_name('northwind_bms');
session_set_cookie_params([
    'httponly' => true,
    'secure' => $isHttps,
    'samesite' => 'Strict',
    'path' => '/',
]);
session_start();

function respond(array $body, int $status = 200): never
{
    Response::json($body, $status);
}

function db(): PDO
{
    static $connection = null;
    if ($connection instanceof PDO) {
        return $connection;
    }

    $configPath = dirname(__DIR__) . '/config.local.php';
    if (!is_file($configPath)) {
        respond([
            'success' => false,
            'message' => 'ยังไม่ได้ตั้งค่าฐานข้อมูล กรุณาคัดลอก config.example.php เป็น config.local.php แล้วใส่ค่าการเชื่อมต่อ MAMP',
        ], 503);
    }

    $config = require $configPath;
    foreach (['host', 'port', 'database', 'username', 'password'] as $key) {
        if (!array_key_exists($key, $config)) {
            error_log('Northwind BMS: database config is missing ' . $key);
            respond(['success' => false, 'message' => 'การตั้งค่าฐานข้อมูลไม่ครบถ้วน'], 503);
        }
    }

    try {
        $connection = ConnDB::connect($config);
        return $connection;
    } catch (PDOException $error) {
        error_log('Northwind BMS database connection failed: ' . $error->getMessage());
        respond(['success' => false, 'message' => 'เชื่อมต่อฐานข้อมูลไม่สำเร็จ ตรวจสอบบริการ MySQL และค่าใน api/config.local.php'], 503);
    }
}

function requestBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }

    $body = json_decode($raw, true);
    if (!is_array($body)) {
        respond(['success' => false, 'message' => 'รูปแบบข้อมูลไม่ถูกต้อง'], 400);
    }
    return $body;
}

function requireLogin(): void
{
    if (!isset($_SESSION['user_id'])) {
        respond(['success' => false, 'message' => 'กรุณาเข้าสู่ระบบ'], 401);
    }
}

function requireCsrf(): void
{
    $provided = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $expected = $_SESSION['csrf_token'] ?? '';
    if (!is_string($provided) || $expected === '' || !hash_equals($expected, $provided)) {
        respond(['success' => false, 'message' => 'เซสชันหมดอายุ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง'], 419);
    }
}

function currentUser(): array
{
    return [
        'id' => (int) $_SESSION['user_id'],
        'username' => (string) $_SESSION['username'],
        'display_name' => (string) $_SESSION['display_name'],
    ];
}

function entityDefinitions(): array
{
    return [
        'products' => [
            'table' => 'tb_products',
            'id' => 'i_ProductID',
            'auto_id' => true,
            'references' => [['table' => 'tb_orderdetails', 'column' => 'i_ProductID']],
            'fields' => ['c_ProductName', 'i_SupplierID', 'i_CategoryID', 'c_Unit', 'i_Price'],
            'required' => ['c_ProductName', 'i_SupplierID', 'i_CategoryID', 'c_Unit', 'i_Price'],
            'limits' => ['c_ProductName' => 30, 'c_Unit' => 30],
            'select' => "SELECT p.i_ProductID AS id, p.c_ProductName AS name, p.i_SupplierID AS supplier_id,
                                s.c_SupplierName AS supplier, p.i_CategoryID AS category_id,
                                c.c_CategoryName AS category, p.c_Unit AS unit, p.i_Price AS price
                         FROM tb_products p
                         LEFT JOIN tb_suppliers s ON s.i_SupplierID = p.i_SupplierID
                         LEFT JOIN tb_categories c ON c.i_CategoryID = p.i_CategoryID",
            'search' => ['name', 'supplier', 'category', 'unit'],
        ],
        'categories' => [
            'table' => 'tb_categories',
            'id' => 'i_CategoryID',
            'auto_id' => false,
            'references' => [['table' => 'tb_products', 'column' => 'i_CategoryID']],
            'fields' => ['c_CategoryName', 'c_Description'],
            'required' => ['c_CategoryName', 'c_Description'],
            'limits' => ['c_CategoryName' => 30, 'c_Description' => 30],
            'select' => "SELECT c.i_CategoryID AS id, c.c_CategoryName AS name, c.c_Description AS description,
                                COUNT(p.i_ProductID) AS product_count
                         FROM tb_categories c
                         LEFT JOIN tb_products p ON p.i_CategoryID = c.i_CategoryID
                         GROUP BY c.i_CategoryID, c.c_CategoryName, c.c_Description",
            'search' => ['name', 'description'],
        ],
        'customers' => [
            'table' => 'tb_customers',
            'id' => 'i_customerid',
            'auto_id' => false,
            'references' => [['table' => 'tb_orders', 'column' => 'i_CustomerID']],
            'fields' => ['c_customername', 'c_contactname', 'c_address', 'c_city', 'c_postalcode', 'c_country'],
            'required' => ['c_customername', 'c_contactname', 'c_address', 'c_city', 'c_postalcode', 'c_country'],
            'limits' => ['c_customername' => 50, 'c_contactname' => 50, 'c_city' => 50, 'c_postalcode' => 30, 'c_country' => 50],
            'select' => "SELECT c.i_customerid AS id, c.c_customername AS name, c.c_contactname AS contact,
                                c.c_address AS address, c.c_city AS city, c.c_postalcode AS postal_code,
                                c.c_country AS country, COUNT(o.i_OrderID) AS order_count
                         FROM tb_customers c
                         LEFT JOIN tb_orders o ON o.i_CustomerID = c.i_customerid
                         GROUP BY c.i_customerid, c.c_customername, c.c_contactname, c.c_address,
                                  c.c_city, c.c_postalcode, c.c_country",
            'search' => ['name', 'contact', 'city', 'country'],
        ],
        'suppliers' => [
            'table' => 'tb_suppliers',
            'id' => 'i_SupplierID',
            'auto_id' => false,
            'references' => [['table' => 'tb_products', 'column' => 'i_SupplierID']],
            'fields' => ['c_SupplierName', 'c_ContactName', 'c_Address', 'c_City', 'c_PostalCode', 'c_Country', 'c_Phone'],
            'required' => ['c_SupplierName', 'c_ContactName', 'c_Address', 'c_City', 'c_PostalCode', 'c_Country', 'c_Phone'],
            'limits' => ['c_SupplierName' => 30, 'c_ContactName' => 30, 'c_Address' => 30, 'c_City' => 30, 'c_PostalCode' => 30, 'c_Country' => 30, 'c_Phone' => 30],
            'select' => "SELECT s.i_SupplierID AS id, s.c_SupplierName AS name, s.c_ContactName AS contact,
                                s.c_Address AS address, s.c_City AS city, s.c_PostalCode AS postal_code,
                                s.c_Country AS country, s.c_Phone AS phone, COUNT(p.i_ProductID) AS product_count
                         FROM tb_suppliers s
                         LEFT JOIN tb_products p ON p.i_SupplierID = s.i_SupplierID
                         GROUP BY s.i_SupplierID, s.c_SupplierName, s.c_ContactName, s.c_Address,
                                  s.c_City, s.c_PostalCode, s.c_Country, s.c_Phone",
            'search' => ['name', 'contact', 'city', 'country', 'phone'],
        ],
        'employees' => [
            'table' => 'tb_employees',
            'id' => 'i_EmployeeID',
            'auto_id' => false,
            'references' => [['table' => 'tb_orders', 'column' => 'i_EmployeeID']],
            'fields' => ['c_LastName', 'c_FirstName', 'c_BirthDate', 'c_Photo', 'c_Notes'],
            'required' => ['c_LastName', 'c_FirstName', 'c_BirthDate', 'c_Photo', 'c_Notes'],
            'limits' => ['c_LastName' => 30, 'c_FirstName' => 30, 'c_BirthDate' => 30, 'c_Photo' => 30, 'c_Notes' => 80],
            'select' => "SELECT e.i_EmployeeID AS id, e.c_FirstName AS first_name, e.c_LastName AS last_name,
                                e.c_BirthDate AS birth_date, e.c_Photo AS photo, e.c_Notes AS notes,
                                COUNT(o.i_OrderID) AS order_count
                         FROM tb_employees e
                         LEFT JOIN tb_orders o ON o.i_EmployeeID = e.i_EmployeeID
                         GROUP BY e.i_EmployeeID, e.c_FirstName, e.c_LastName, e.c_BirthDate, e.c_Photo, e.c_Notes",
            'search' => ['first_name', 'last_name', 'notes'],
        ],
        'shippers' => [
            'table' => 'tb_shippers',
            'id' => 'i_ShipperID',
            'auto_id' => false,
            'references' => [['table' => 'tb_orders', 'column' => 'i_ShipperID']],
            'fields' => ['c_ShipperName', 'c_Phone'],
            'required' => ['c_ShipperName', 'c_Phone'],
            'limits' => ['c_ShipperName' => 30, 'c_Phone' => 30],
            'select' => "SELECT s.i_ShipperID AS id, s.c_ShipperName AS name, s.c_Phone AS phone,
                                COUNT(o.i_OrderID) AS order_count
                         FROM tb_shippers s
                         LEFT JOIN tb_orders o ON o.i_ShipperID = s.i_ShipperID
                         GROUP BY s.i_ShipperID, s.c_ShipperName, s.c_Phone",
            'search' => ['name', 'phone'],
        ],
    ];
}

function entityDefinition(string $resource): array
{
    $definitions = entityDefinitions();
    if (!isset($definitions[$resource])) {
        respond(['success' => false, 'message' => 'ไม่พบข้อมูลที่ร้องขอ'], 404);
    }
    return $definitions[$resource];
}

function entityRows(string $resource, array $definition): array
{
    $statement = db()->prepare($definition['select']);
    $statement->execute();
    $rows = $statement->fetchAll();
    $query = trim((string) ($_GET['q'] ?? ''));
    if ($query !== '') {
        $needle = function_exists('mb_strtolower') ? mb_strtolower($query, 'UTF-8') : strtolower($query);
        $rows = array_values(array_filter($rows, static function (array $row) use ($definition, $needle): bool {
            foreach ($definition['search'] as $key) {
                $value = (string) ($row[$key] ?? '');
                $candidate = function_exists('mb_strtolower') ? mb_strtolower($value, 'UTF-8') : strtolower($value);
                if (str_contains($candidate, $needle)) {
                    return true;
                }
            }
            return false;
        }));
    }
    return $rows;
}

function nextPrimaryKey(PDO $connection, string $table, string $column): int
{
    $statement = $connection->prepare(sprintf(
        'SELECT %s FROM %s ORDER BY %s DESC LIMIT 1 FOR UPDATE',
        $column,
        $table,
        $column
    ));
    $statement->execute();
    return ((int) $statement->fetchColumn()) + 1;
}

function writeEntity(string $resource, array $definition, string $method, ?string $id): void
{
    $payload = requestBody();
    $values = [];
    foreach ($definition['fields'] as $field) {
        if (array_key_exists($field, $payload)) {
            $value = $payload[$field];
            if (is_string($value)) {
                $value = trim($value);
            }
            if ($value === '') {
                respond(['success' => false, 'message' => 'กรุณากรอกข้อมูลให้ครบถ้วน'], 422);
            }
            if (isset($definition['limits'][$field])) {
                $length = function_exists('mb_strlen') ? mb_strlen((string) $value, 'UTF-8') : strlen((string) $value);
                if ($length > $definition['limits'][$field]) {
                    respond(['success' => false, 'message' => $field . ' มีความยาวเกินกำหนด'], 422);
                }
            }
            if (in_array($field, ['i_SupplierID', 'i_CategoryID'], true)
                && (!filter_var($value, FILTER_VALIDATE_INT) || (int) $value < 1)) {
                respond(['success' => false, 'message' => 'กรุณาเลือกหมวดหมู่และผู้จัดจำหน่ายที่ถูกต้อง'], 422);
            }
            if ($field === 'i_Price' && (!is_numeric($value) || (float) $value < 0)) {
                respond(['success' => false, 'message' => 'กรุณาระบุราคาที่ถูกต้อง'], 422);
            }
            $values[$field] = $value;
        } elseif ($method === 'POST' && in_array($field, $definition['required'], true)) {
            respond(['success' => false, 'message' => 'กรุณากรอกข้อมูลให้ครบถ้วน'], 422);
        }
    }
    foreach ([
        'i_SupplierID' => ['tb_suppliers', 'i_SupplierID'],
        'i_CategoryID' => ['tb_categories', 'i_CategoryID'],
    ] as $field => [$table, $column]) {
        if (isset($values[$field])) {
            $reference = db()->prepare(sprintf('SELECT 1 FROM %s WHERE %s = :id', $table, $column));
            $reference->execute([':id' => (int) $values[$field]]);
            if (!$reference->fetchColumn()) {
                respond(['success' => false, 'message' => 'เลือกหมวดหมู่หรือผู้จัดจำหน่ายที่มีอยู่ในระบบ'], 422);
            }
        }
    }

    if ($method === 'POST') {
        $connection = db();
        $connection->beginTransaction();
        try {
            $recordId = null;
            if (!$definition['auto_id']) {
                $recordId = nextPrimaryKey($connection, $definition['table'], $definition['id']);
                $values = [$definition['id'] => $recordId] + $values;
            }
            $columns = array_keys($values);
            $placeholders = array_map(static fn(string $column): string => ':' . $column, $columns);
            $sql = sprintf(
                'INSERT INTO %s (%s) VALUES (%s)',
                $definition['table'],
                implode(', ', $columns),
                implode(', ', $placeholders)
            );
            $statement = $connection->prepare($sql);
            foreach ($values as $column => $value) {
                $statement->bindValue(':' . $column, $value);
            }
            $statement->execute();
            if ($connection->inTransaction()) {
                $connection->commit();
            }
            respond(['success' => true, 'data' => ['id' => $recordId ?? (int) $connection->lastInsertId()]], 201);
        } catch (Throwable $error) {
            if ($connection->inTransaction()) {
                $connection->rollBack();
            }
            throw $error;
        }
    }

    if ($id === null || !ctype_digit($id) || (int) $id < 1) {
        respond(['success' => false, 'message' => 'รหัสรายการไม่ถูกต้อง'], 400);
    }

    if ($method === 'PUT') {
        if ($values === []) {
            respond(['success' => false, 'message' => 'ไม่มีข้อมูลที่ต้องการแก้ไข'], 422);
        }
        $assignments = [];
        foreach ($values as $column => $value) {
            $assignments[] = $column . ' = :' . $column;
        }
        $sql = sprintf(
            'UPDATE %s SET %s WHERE %s = :record_id',
            $definition['table'],
            implode(', ', $assignments),
            $definition['id']
        );
        $statement = db()->prepare($sql);
        foreach ($values as $column => $value) {
            $statement->bindValue(':' . $column, $value);
        }
        $statement->bindValue(':record_id', (int) $id, PDO::PARAM_INT);
        $statement->execute();
        if ($statement->rowCount() === 0 && !entityExists($definition, (int) $id)) {
            respond(['success' => false, 'message' => 'ไม่พบข้อมูลที่ต้องการแก้ไข'], 404);
        }
        respond(['success' => true, 'message' => 'บันทึกการแก้ไขเรียบร้อยแล้ว']);
    }

    if ($method === 'DELETE') {
        foreach ($definition['references'] as $reference) {
            $referenceCheck = db()->prepare(sprintf(
                'SELECT COUNT(*) FROM %s WHERE %s = :record_id',
                $reference['table'],
                $reference['column']
            ));
            $referenceCheck->execute([':record_id' => (int) $id]);
            if ((int) $referenceCheck->fetchColumn() > 0) {
                respond(['success' => false, 'message' => 'ไม่สามารถลบรายการนี้ได้ เพราะมีข้อมูลอื่นอ้างอิงอยู่'], 409);
            }
        }
        $statement = db()->prepare(sprintf(
            'DELETE FROM %s WHERE %s = :record_id',
            $definition['table'],
            $definition['id']
        ));
        $statement->execute([':record_id' => (int) $id]);
        if ($statement->rowCount() === 0) {
            respond(['success' => false, 'message' => 'ไม่พบข้อมูลที่ต้องการลบ'], 404);
        }
        respond(['success' => true, 'message' => 'ลบข้อมูลเรียบร้อยแล้ว']);
    }
}

function entityExists(array $definition, int $id): bool
{
    $statement = db()->prepare(sprintf(
        'SELECT 1 FROM %s WHERE %s = :record_id',
        $definition['table'],
        $definition['id']
    ));
    $statement->execute([':record_id' => $id]);
    return (bool) $statement->fetchColumn();
}

function orderDetails(int $orderId): array
{
    $statement = db()->prepare(
        'SELECT d.i_ProductID AS product_id, p.c_ProductName AS product_name,
                d.i_Quantity AS quantity, p.i_Price AS unit_price,
                d.i_Quantity * p.i_Price AS line_total
         FROM tb_orderdetails d
         JOIN tb_products p ON p.i_ProductID = d.i_ProductID
         WHERE d.i_OrderID = :order_id
         ORDER BY d.i_OrderDetailID'
    );
    $statement->execute([':order_id' => $orderId]);
    return $statement->fetchAll();
}

function createOrder(): void
{
    $payload = requestBody();
    $customerId = filter_var($payload['customer_id'] ?? null, FILTER_VALIDATE_INT);
    $employeeId = filter_var($payload['employee_id'] ?? null, FILTER_VALIDATE_INT);
    $shipperId = filter_var($payload['shipper_id'] ?? null, FILTER_VALIDATE_INT);
    $orderDate = trim((string) ($payload['order_date'] ?? ''));
    $items = $payload['items'] ?? [];
    $date = DateTime::createFromFormat('Y-m-d', $orderDate);
    if (!$customerId || !$employeeId || !$shipperId || !$date || $date->format('Y-m-d') !== $orderDate
        || !is_array($items) || $items === []) {
        respond(['success' => false, 'message' => 'กรุณากรอกข้อมูลคำสั่งซื้อและสินค้าอย่างน้อย 1 รายการ'], 422);
    }

    $connection = db();
    $connection->beginTransaction();
    try {
        foreach ([
            ['tb_customers', 'i_customerid', $customerId],
            ['tb_employees', 'i_EmployeeID', $employeeId],
            ['tb_shippers', 'i_ShipperID', $shipperId],
        ] as [$table, $column, $recordId]) {
            $reference = $connection->prepare(sprintf('SELECT 1 FROM %s WHERE %s = :id', $table, $column));
            $reference->execute([':id' => $recordId]);
            if (!$reference->fetchColumn()) {
                throw new InvalidArgumentException('เลือกลูกค้า พนักงาน และบริษัทขนส่งที่มีอยู่ในระบบ');
            }
        }
        $orderId = nextPrimaryKey($connection, 'tb_orders', 'i_OrderID');
        $statement = $connection->prepare(
            'INSERT INTO tb_orders (i_OrderID, i_CustomerID, i_EmployeeID, c_OrderDate, i_ShipperID)
             VALUES (:order_id, :customer_id, :employee_id, :order_date, :shipper_id)'
        );
        $statement->execute([
            ':order_id' => $orderId,
            ':customer_id' => $customerId,
            ':employee_id' => $employeeId,
            ':order_date' => $orderDate,
            ':shipper_id' => $shipperId,
        ]);
        $itemStatement = $connection->prepare(
            'INSERT INTO tb_orderdetails (i_OrderDetailID, i_OrderID, i_ProductID, i_Quantity)
             VALUES (:detail_id, :order_id, :product_id, :quantity)'
        );
        foreach ($items as $item) {
            $productId = filter_var($item['product_id'] ?? null, FILTER_VALIDATE_INT);
            $quantity = filter_var($item['quantity'] ?? null, FILTER_VALIDATE_INT);
            if (!$productId || !$quantity || $quantity < 1) {
                throw new InvalidArgumentException('รายการสินค้าไม่ถูกต้อง');
            }
            $productCheck = $connection->prepare('SELECT 1 FROM tb_products WHERE i_ProductID = :id');
            $productCheck->execute([':id' => $productId]);
            if (!$productCheck->fetchColumn()) {
                throw new InvalidArgumentException('ไม่พบสินค้าที่เลือกในฐานข้อมูล');
            }
            $detailId = nextPrimaryKey($connection, 'tb_orderdetails', 'i_OrderDetailID');
            $itemStatement->execute([
                ':detail_id' => $detailId,
                ':order_id' => $orderId,
                ':product_id' => $productId,
                ':quantity' => $quantity,
            ]);
        }
        $connection->commit();
        respond(['success' => true, 'data' => ['id' => $orderId]], 201);
    } catch (InvalidArgumentException $error) {
        $connection->rollBack();
        respond(['success' => false, 'message' => $error->getMessage()], 422);
    } catch (Throwable $error) {
        $connection->rollBack();
        throw $error;
    }
}

function reportData(): array
{
    $connection = db();
    $year = trim((string) ($_GET['year'] ?? ''));
    $yearSql = '';
    $ordersYearSql = '';
    $parameters = [];
    $normalizedOrderDate = "COALESCE(STR_TO_DATE(o.c_OrderDate, '%c/%e/%Y'), STR_TO_DATE(o.c_OrderDate, '%Y-%m-%d'))";
    if ($year !== '' && $year !== 'all') {
        if (!preg_match('/^\d{4}$/', $year)) {
            respond(['success' => false, 'message' => 'ปีที่ระบุไม่ถูกต้อง'], 400);
        }
        $yearSql = ' WHERE YEAR(' . $normalizedOrderDate . ') = :year';
        $ordersYearSql = ' WHERE YEAR(' . $normalizedOrderDate . ') = :year';
        $parameters[':year'] = (int) $year;
    }

    $summary = $connection->prepare(
        'SELECT COUNT(DISTINCT o.i_OrderID) AS order_count,
                COALESCE(SUM(d.i_Quantity * p.i_Price), 0) AS revenue,
                COUNT(DISTINCT o.i_CustomerID) AS customer_count
         FROM tb_orders o
         LEFT JOIN tb_orderdetails d ON d.i_OrderID = o.i_OrderID
         LEFT JOIN tb_products p ON p.i_ProductID = d.i_ProductID' . $yearSql
    );
    $summary->execute($parameters);
    $totals = $summary->fetch() ?: ['order_count' => 0, 'revenue' => 0, 'customer_count' => 0];

    $topProductsStatement = $connection->prepare(
        'SELECT p.c_ProductName AS name, SUM(d.i_Quantity) AS quantity,
                SUM(d.i_Quantity * p.i_Price) AS revenue
         FROM tb_orderdetails d
         JOIN tb_orders o ON o.i_OrderID = d.i_OrderID
         JOIN tb_products p ON p.i_ProductID = d.i_ProductID
         ' . $ordersYearSql . '
         GROUP BY p.i_ProductID, p.c_ProductName
         ORDER BY quantity DESC
         LIMIT 5'
    );
    $topProductsStatement->execute($parameters);
    $topProducts = $topProductsStatement->fetchAll();
    $topCustomersStatement = $connection->prepare(
        'SELECT c.c_customername AS name, COUNT(DISTINCT o.i_OrderID) AS order_count,
                c.c_country AS country, COALESCE(SUM(d.i_Quantity * p.i_Price), 0) AS revenue
         FROM tb_customers c
         JOIN tb_orders o ON o.i_CustomerID = c.i_customerid
         LEFT JOIN tb_orderdetails d ON d.i_OrderID = o.i_OrderID
         LEFT JOIN tb_products p ON p.i_ProductID = d.i_ProductID
         ' . $ordersYearSql . '
         GROUP BY c.i_customerid, c.c_customername, c.c_country
         ORDER BY revenue DESC
         LIMIT 5'
    );
    $topCustomersStatement->execute($parameters);
    $topCustomers = $topCustomersStatement->fetchAll();
    $topEmployeesStatement = $connection->prepare(
        'SELECT CONCAT(e.c_FirstName, \' \', e.c_LastName) AS name,
                COUNT(DISTINCT o.i_OrderID) AS order_count,
                COALESCE(SUM(d.i_Quantity * p.i_Price), 0) AS revenue
         FROM tb_employees e
         JOIN tb_orders o ON o.i_EmployeeID = e.i_EmployeeID
         LEFT JOIN tb_orderdetails d ON d.i_OrderID = o.i_OrderID
         LEFT JOIN tb_products p ON p.i_ProductID = d.i_ProductID
         ' . $ordersYearSql . '
         GROUP BY e.i_EmployeeID, e.c_FirstName, e.c_LastName
         ORDER BY revenue DESC
         LIMIT 5'
    );
    $topEmployeesStatement->execute($parameters);
    $topEmployees = $topEmployeesStatement->fetchAll();
    $popularShipperStatement = $connection->prepare(
        'SELECT s.c_ShipperName AS name, COUNT(o.i_OrderID) AS order_count
         FROM tb_shippers s
         JOIN tb_orders o ON o.i_ShipperID = s.i_ShipperID
         ' . $ordersYearSql . '
         GROUP BY s.i_ShipperID, s.c_ShipperName
         ORDER BY order_count DESC
         LIMIT 1'
    );
    $popularShipperStatement->execute($parameters);
    $popularShipper = $popularShipperStatement->fetch() ?: ['name' => '—', 'order_count' => 0];

    return [
        'summary' => [
            'order_count' => (int) $totals['order_count'],
            'revenue' => (float) $totals['revenue'],
            'average_order' => (int) $totals['order_count'] > 0
                ? (float) $totals['revenue'] / (int) $totals['order_count'] : 0,
            'customer_count' => (int) $totals['customer_count'],
            'popular_shipper' => $popularShipper['name'],
            'popular_shipper_orders' => (int) $popularShipper['order_count'],
        ],
        'top_products' => $topProducts,
        'top_customers' => $topCustomers,
        'top_employees' => $topEmployees,
    ];
}

function handleApiRequest(): void
{
    $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $action = (string) ($_GET['action'] ?? '');
    $resource = (string) ($_GET['resource'] ?? '');
    $id = isset($_GET['id']) ? (string) $_GET['id'] : null;

    try {
    if ($method === 'POST' && $action === 'login') {
        $payload = requestBody();
        $username = trim((string) ($payload['username'] ?? ''));
        $password = (string) ($payload['password'] ?? '');
        if ($username === '' || $password === '') {
            respond(['success' => false, 'message' => 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'], 422);
        }
        $statement = db()->prepare(
            'SELECT id, username, password_hash, display_name FROM users WHERE username = :username LIMIT 1'
        );
        $statement->execute([':username' => $username]);
        $user = $statement->fetch();
        if (!$user || !password_verify($password, $user['password_hash'])) {
            respond(['success' => false, 'message' => 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'], 401);
        }
        session_regenerate_id(true);
        $_SESSION['user_id'] = (int) $user['id'];
        $_SESSION['username'] = (string) $user['username'];
        $_SESSION['display_name'] = (string) $user['display_name'];
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        respond(['success' => true, 'data' => ['user' => currentUser(), 'csrf_token' => $_SESSION['csrf_token']]]);
    }

    if ($method === 'POST' && $action === 'change-password') {
        requireLogin();
        requireCsrf();
        $payload = requestBody();
        $oldPassword = (string) ($payload['old_password'] ?? '');
        $newPassword = (string) ($payload['new_password'] ?? '');
        if (strlen($newPassword) < 10) {
            respond(['success' => false, 'message' => 'รหัสผ่านใหม่ต้องมีอย่างน้อย 10 ตัวอักษร'], 422);
        }
        $statement = db()->prepare('SELECT password_hash FROM users WHERE id = :id');
        $statement->execute([':id' => (int) $_SESSION['user_id']]);
        $hash = $statement->fetchColumn();
        if (!is_string($hash) || !password_verify($oldPassword, $hash)) {
            respond(['success' => false, 'message' => 'รหัสผ่านปัจจุบันไม่ถูกต้อง'], 401);
        }
        $statement = db()->prepare('UPDATE users SET password_hash = :password_hash WHERE id = :id');
        $statement->execute([
            ':password_hash' => password_hash($newPassword, PASSWORD_DEFAULT),
            ':id' => (int) $_SESSION['user_id'],
        ]);
        respond(['success' => true, 'message' => 'เปลี่ยนรหัสผ่านเรียบร้อยแล้ว']);
    }

    if ($method === 'GET' && $action === 'me') {
        requireLogin();
        if (!isset($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        respond(['success' => true, 'data' => ['user' => currentUser(), 'csrf_token' => $_SESSION['csrf_token']]]);
    }

    requireLogin();

    if ($method === 'POST' || $method === 'PUT' || $method === 'DELETE') {
        requireCsrf();
    }

    if ($method === 'POST' && $action === 'logout') {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $cookie = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $cookie['path'], $cookie['domain'], $cookie['secure'], $cookie['httponly']);
        }
        session_destroy();
        respond(['success' => true]);
    }

    if ($method === 'GET' && $resource === 'reports') {
        respond(['success' => true, 'data' => reportData()]);
    }

    if ($method === 'GET' && $resource === 'order-details') {
        $orderId = filter_var($_GET['order_id'] ?? null, FILTER_VALIDATE_INT);
        if (!$orderId || $orderId < 1) {
            respond(['success' => false, 'message' => 'ระบุเลขที่คำสั่งซื้อไม่ถูกต้อง'], 400);
        }
        respond(['success' => true, 'data' => orderDetails($orderId)]);
    }

    if ($resource === 'orders') {
        if ($method === 'GET' && $id !== null) {
            if (!ctype_digit($id) || (int) $id < 1) {
                respond(['success' => false, 'message' => 'เลขที่คำสั่งซื้อไม่ถูกต้อง'], 400);
            }
            $statement = db()->prepare(
                'SELECT o.i_OrderID AS id, o.i_CustomerID AS customer_id, c.c_customername AS customer,
                        c.c_contactname AS contact, c.c_city AS city, c.c_country AS country,
                        c.c_postalcode AS postal_code, o.i_EmployeeID AS employee_id,
                        CONCAT(e.c_FirstName, \' \', e.c_LastName) AS employee,
                        COALESCE(DATE_FORMAT(STR_TO_DATE(o.c_OrderDate, \'%c/%e/%Y\'), \'%Y-%m-%d\'),
                                 DATE_FORMAT(STR_TO_DATE(o.c_OrderDate, \'%Y-%m-%d\'), \'%Y-%m-%d\')) AS order_date,
                        o.i_ShipperID AS shipper_id, s.c_ShipperName AS shipper
                 FROM tb_orders o
                 JOIN tb_customers c ON c.i_customerid = o.i_CustomerID
                 JOIN tb_employees e ON e.i_EmployeeID = o.i_EmployeeID
                 JOIN tb_shippers s ON s.i_ShipperID = o.i_ShipperID
                 WHERE o.i_OrderID = :id'
            );
            $statement->execute([':id' => (int) $id]);
            $order = $statement->fetch();
            if (!$order) {
                respond(['success' => false, 'message' => 'ไม่พบคำสั่งซื้อ'], 404);
            }
            $order['items'] = orderDetails((int) $id);
            respond(['success' => true, 'data' => $order]);
        }
        if ($method === 'GET') {
            $query = "SELECT o.i_OrderID AS id, o.i_CustomerID AS customer_id, c.c_customername AS customer,
                             o.i_EmployeeID AS employee_id, CONCAT(e.c_FirstName, ' ', e.c_LastName) AS employee,
                             COALESCE(DATE_FORMAT(STR_TO_DATE(o.c_OrderDate, '%c/%e/%Y'), '%Y-%m-%d'),
                                      DATE_FORMAT(STR_TO_DATE(o.c_OrderDate, '%Y-%m-%d'), '%Y-%m-%d')) AS order_date,
                             o.i_ShipperID AS shipper_id,
                             s.c_ShipperName AS shipper, COUNT(d.i_OrderDetailID) AS item_count,
                             COALESCE(SUM(d.i_Quantity * p.i_Price), 0) AS total
                      FROM tb_orders o
                      JOIN tb_customers c ON c.i_customerid = o.i_CustomerID
                      JOIN tb_employees e ON e.i_EmployeeID = o.i_EmployeeID
                      JOIN tb_shippers s ON s.i_ShipperID = o.i_ShipperID
                      LEFT JOIN tb_orderdetails d ON d.i_OrderID = o.i_OrderID
                      LEFT JOIN tb_products p ON p.i_ProductID = d.i_ProductID";
            $statement = db()->prepare($query . ' GROUP BY o.i_OrderID, o.i_CustomerID, c.c_customername,
                                                   o.i_EmployeeID, e.c_FirstName, e.c_LastName, o.c_OrderDate,
                                                   o.i_ShipperID, s.c_ShipperName
                                                   ORDER BY o.i_OrderID DESC');
            $statement->execute();
            $orders = $statement->fetchAll();
            $search = trim((string) ($_GET['q'] ?? ''));
            if ($search !== '') {
                $needle = function_exists('mb_strtolower') ? mb_strtolower($search, 'UTF-8') : strtolower($search);
                $orders = array_values(array_filter($orders, static function (array $order) use ($needle): bool {
                    $text = implode(' ', [$order['id'], $order['customer'], $order['employee'], $order['shipper']]);
                    $text = function_exists('mb_strtolower') ? mb_strtolower($text, 'UTF-8') : strtolower($text);
                    return str_contains($text, $needle);
                }));
            }
            $status = (string) ($_GET['status'] ?? '');
            if ($status !== '') {
                $orders = array_values(array_filter($orders, static function (array $order) use ($status): bool {
                    $orderStatus = (int) $order['item_count'] > 0 ? 'มีรายการสินค้า' : 'ไม่มีรายการสินค้า';
                    return $orderStatus === $status;
                }));
            }
            $from = trim((string) ($_GET['from'] ?? ''));
            $to = trim((string) ($_GET['to'] ?? ''));
            if (($from !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $from))
                || ($to !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $to))) {
                respond(['success' => false, 'message' => 'รูปแบบวันที่ไม่ถูกต้อง'], 400);
            }
            if ($from !== '') {
                $orders = array_values(array_filter($orders, static fn(array $order): bool => $order['order_date'] >= $from));
            }
            if ($to !== '') {
                $orders = array_values(array_filter($orders, static fn(array $order): bool => $order['order_date'] <= $to));
            }
            respond(['success' => true, 'data' => $orders]);
        }
        if ($method === 'POST') {
            createOrder();
        }
    }

    if ($resource !== '') {
        if ($resource === 'categories') {
            CategoryController::handle($method, $id);
        } elseif ($resource === 'products') {
            ProductController::handle($method, $id);
        } elseif ($resource === 'suppliers') {
            SupplierController::handle($method, $id);
        } else {
            EntityController::handle($resource, $method, $id);
        }
    }

    respond(['success' => false, 'message' => 'ไม่พบ API endpoint'], 404);
    } catch (PDOException $error) {
        error_log('Northwind BMS API database error: ' . $error->getMessage());
        if (isset($connection) && $connection instanceof PDO && $connection->inTransaction()) {
            $connection->rollBack();
        }
        $code = $error->getCode() === '23000' ? 409 : 500;
        $message = $code === 409
            ? 'รายการนี้ถูกใช้งานอยู่ จึงไม่สามารถลบหรือบันทึกข้อมูลที่ขัดกับความสัมพันธ์ได้'
            : 'ระบบไม่สามารถดำเนินการกับฐานข้อมูลได้';
        respond(['success' => false, 'message' => $message], $code);
    } catch (Throwable $error) {
        error_log('Northwind BMS API error: ' . $error->getMessage());
        respond(['success' => false, 'message' => 'เกิดข้อผิดพลาดในระบบ กรุณาลองอีกครั้ง'], 500);
    }
}

final class ApiController
{
    public static function handle(): void
    {
        handleApiRequest();
    }
}

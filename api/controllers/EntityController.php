<?php

declare(strict_types=1);

class EntityController
{
    public static function handle(string $resource, string $method, ?string $id): void
    {
        $definition = entityDefinition($resource);
        if ($method === 'GET') {
            $rows = entityRows($resource, $definition);
            if ($id !== null) {
                if (!ctype_digit($id) || (int) $id < 1) {
                    respond(['success' => false, 'message' => 'รหัสรายการไม่ถูกต้อง'], 400);
                }
                foreach ($rows as $row) {
                    if ((int) $row['id'] === (int) $id) {
                        respond(['success' => true, 'data' => $row]);
                    }
                }
                respond(['success' => false, 'message' => 'ไม่พบข้อมูลที่ร้องขอ'], 404);
            }
            respond(['success' => true, 'data' => $rows]);
        }
        if (in_array($method, ['POST', 'PUT', 'DELETE'], true)) {
            writeEntity($resource, $definition, $method, $id);
        }
    }
}

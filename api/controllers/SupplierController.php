<?php

declare(strict_types=1);

final class SupplierController
{
    public static function handle(string $method, ?string $id): void
    {
        EntityController::handle('suppliers', $method, $id);
    }
}

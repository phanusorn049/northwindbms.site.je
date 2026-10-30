<?php

declare(strict_types=1);

final class ProductController
{
    public static function handle(string $method, ?string $id): void
    {
        EntityController::handle('products', $method, $id);
    }
}

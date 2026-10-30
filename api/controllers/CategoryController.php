<?php

declare(strict_types=1);

final class CategoryController
{
    public static function handle(string $method, ?string $id): void
    {
        EntityController::handle('categories', $method, $id);
    }
}

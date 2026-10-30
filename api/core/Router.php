<?php

declare(strict_types=1);

final class Router
{
    public function dispatch(callable $handler): void
    {
        $handler();
    }
}

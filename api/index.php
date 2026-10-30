<?php

declare(strict_types=1);

require_once __DIR__ . '/controllers/ApiController.php';

$router = new Router();
$router->dispatch([ApiController::class, 'handle']);

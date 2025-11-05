# Fullstack Application

Fullstack приложение с использованием Express.js для backend и React + Vite для frontend.

## Структура проекта

```
.
├── backend/          # Express.js сервер
│   ├── server.js     # Основной файл сервера
│   ├── package.json  # Зависимости backend
│   └── .env.example  # Пример файла окружения
├── frontend/         # React + Vite приложение
│   ├── src/          # Исходный код приложения
│   ├── index.html    # HTML шаблон
│   ├── vite.config.js # Конфигурация Vite
│   └── package.json  # Зависимости frontend
├── docker-compose.yml # Docker конфигурация
└── README.md         # Документация
```

## Локальный запуск

### Предварительные требования

- Node.js (версия 18 или выше)
- npm

### Backend

1. Перейдите в директорию backend:
```bash
cd backend
```

2. Установите зависимости:
```bash
npm install
```

3. Создайте файл `.env` на основе `.env.example`:
```bash
cp .env.example .env
```

4. Запустите сервер в режиме разработки:
```bash
npm run dev
```

Backend будет доступен по адресу `http://localhost:5000`

### Frontend

1. Откройте новый терминал и перейдите в директорию frontend:
```bash
cd frontend
```

2. Установите зависимости:
```bash
npm install
```

3. Запустите приложение в режиме разработки:
```bash
npm run dev
```

Frontend будет доступен по адресу `http://localhost:3000`

## Скрипты

### Backend

- `npm start` - запуск production сервера
- `npm run dev` - запуск development сервера с nodemon
- `npm test` - запуск интеграционных тестов с coverage

### Frontend

- `npm run dev` - запуск development сервера
- `npm run build` - сборка production версии
- `npm run preview` - предпросмотр production сборки

## Docker

Для запуска приложения через Docker:

```bash
# Сборка и запуск контейнеров
docker-compose up --build

# Запуск в фоновом режиме
docker-compose up -d --build

# Остановка контейнеров
docker-compose down

# Просмотр логов
docker-compose logs -f
```

**Порты:**
- Backend: `http://localhost:5000`
- Frontend: `http://localhost:5173`

**Примечание:** Frontend собирается в production режиме и отдается через nginx. Backend запускается в production режиме.

## Тестирование

Для запуска интеграционных тестов backend:

```bash
cd backend
npm test
```

Тесты покрывают:
- Health check endpoint
- Добавление элементов в очередь через `/api/queue/add`
- Получение элементов с пагинацией через `/api/items`
- Сохранение и чтение selection через `/api/selection/update` и `/api/selection`

Для просмотра coverage отчета:

```bash
cd backend
npm test
# Откройте coverage/lcov-report/index.html в браузере
```

---

## Деплой

### Render

Проект готов к деплою на Render:

1. Подключите репозиторий на [render.com](https://render.com)
2. Создайте Web Service с Docker runtime
3. Укажите переменную окружения `NODE_ENV=production`
4. Health check path: `/api/health`

Render автоматически обнаружит `render.yaml` и `Dockerfile`.

### Локальное тестирование production

```bash
docker build -t databoard .
docker run -p 5000:5000 -e NODE_ENV=production databoard
```

---

## Backend API Specification

### GET `/api/health`

Health check endpoint.

**Response:**
```json
{
  "ok": true
}
```

---

### GET `/api/items`

Получить список элементов с фильтрацией и пагинацией.

**Query параметры:**
- `filterId` (number, опционально) - фильтр по ID (contains/equals)
- `offset` (number, опционально, по умолчанию: 0) - смещение для пагинации
- `limit` (number, опционально, по умолчанию: 50, максимум: 1000) - количество элементов на странице

**Примеры запросов:**

```bash
# Получить первые 50 элементов
GET /api/items

# С фильтром и пагинацией
GET /api/items?filterId=123&offset=0&limit=100

# Infinite scroll - следующая страница
GET /api/items?offset=50&limit=50

# Фильтр по ID (содержит "5")
GET /api/items?filterId=5&limit=20
```

**Response:**
```json
{
  "total": 1234,
  "items": [
    {
      "id": 1,
      "createdAt": "2024-01-01T12:00:00.000Z"
    },
    {
      "id": 2,
      "createdAt": "2024-01-01T12:00:01.000Z"
    }
  ]
}
```

**Ошибки:**
- `400` - Неверные параметры (`INVALID_OFFSET`, `INVALID_LIMIT`)
- `500` - Внутренняя ошибка сервера

---

### POST `/api/queue/add`

Добавить элементы в очередь на обработку.

**Request Body:**
```json
{
  "ids": [1000001, 1000002, 1000003]
}
```

**Пример запроса:**
```bash
POST /api/queue/add
Content-Type: application/json

{
  "ids": [1000001, 1000002]
}
```

**Response:**
```json
{
  "accepted": [1000001, 1000002]
}
```

**Примечание:** `accepted` содержит только те ID, которые прошли дедупликацию и были добавлены в очередь. Дубликаты и уже существующие ID не включаются в ответ.

**Ошибки:**
- `400` - Неверный формат данных (`INVALID_INPUT`, `EMPTY_ARRAY`, `INVALID_IDS`)
- `500` - Внутренняя ошибка сервера

---

### GET `/api/selection`

Получить текущую selection (выбранные элементы и их порядок).

**Response:**
```json
{
  "selectedIds": [1, 5, 10, 3],
  "order": [10, 5, 1, 3]
}
```

**Формат:**
- `selectedIds` (number[]) - массив выбранных ID
- `order` (number[]) - упорядоченный массив ID (порядок отображения)

**Ошибки:**
- `500` - Внутренняя ошибка сервера

---

### POST `/api/selection/update`

Обновить selection (выбранные элементы и их порядок).

**Request Body:**
```json
{
  "selectedIds": [1, 5, 10, 3],
  "order": [10, 5, 1, 3]
}
```

**Пример запроса:**
```bash
POST /api/selection/update
Content-Type: application/json

{
  "selectedIds": [1, 5, 10],
  "order": [10, 5, 1]
}
```

**Response:**
```json
{
  "ok": true
}
```

**Примечание:** Изменения применяются в батче каждую секунду. Это означает, что изменения могут быть видны с небольшой задержкой.

**Ошибки:**
- `400` - Неверный формат данных (`INVALID_SELECTED_IDS`, `INVALID_ORDER`, `INVALID_SELECTED_IDS`, `INVALID_ORDER_IDS`)
- `500` - Внутренняя ошибка сервера

---

## Батчинг и дедупликация

Backend использует систему батчинга для оптимизации операций:

- **Добавление в очередь:** элементы обрабатываются батчами каждые 10 секунд
- **Обновление selection:** изменения коммитятся каждую 1 секунду
- **Дедупликация:** дубликаты автоматически отфильтровываются при добавлении в очередь

Все операции логируются в консоль сервера.


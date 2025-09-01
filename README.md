# Pomotoro

## Tech Stack

### Backend
- **FastAPI**: High-performance web framework
- **SQLModel**: SQL database ORM
- **Pydantic**: Data validation
- **JWT**: Authentication
- **Google Generative AI**: AI recommendations

### Frontend
- **React**: UI framework
- **Vite**: Build tool
- **Tauri**: Desktop application framework
- **TypeScript**: Type-safe JavaScript
- **Bun**: JavaScript runtime and package manager

## Project Structure

```
pomotoro/
├── backend/          # FastAPI backend
│   ├── app/         # Application code
│   ├── main.py      # Entry point
│   └── pyproject.toml
├── frontend/         # Tauri + React frontend
│   ├── src/         # React source code
│   ├── src-tauri/   # Tauri Rust code
│   └── package.json
└── README.md        # This file
```

## Setup and Installation

### Prerequisites

- Python 3.12+
- Bun.js
- Rust (for Tauri)
- Follow [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)

### Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Install dependencies:
   ```bash
   pip install -e .
   ```

3. Run the backend server:
   ```bash
   python main.py
   ```

The backend will start on `http://localhost:8000`.

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Run in development mode:
   ```bash
   bun tauri dev
   ```

### Building for Production

1. Build the backend (if needed for deployment)

2. Build the frontend:
   ```bash
   bun tauri build
   ```

The built application will be in `frontend/src-tauri/target/release/`.

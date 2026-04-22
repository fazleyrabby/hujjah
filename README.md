# Hujjah — Local-First Islamic Research

Hujjah is a privacy-focused, offline-capable AI research tool designed for exploring Islamic knowledge. It runs entirely in your browser using on-device embeddings and a local vector database.

![Aesthetic](https://img.shields.io/badge/Aesthetic-Soft--Brutalist-F9F7F2?labelColor=1A1A1A)
![Local First](https://img.shields.io/badge/Architecture-Local--First-2D5F2D)
![WebGPU](https://img.shields.io/badge/Inference-WebGPU-orange)

## 📖 Philosophy: The Digital Manuscript

Hujjah is designed with a **Soft-Brutalist** aesthetic. It moves away from the cluttered, high-frequency interfaces of modern apps and embraces the calm, intentional feel of a high-end physical manuscript.

- **Paper & Ink**: A restricted palette of Paper (`#F9F7F2`) and Ink (`#1A1A1A`).
- **Minimal Interaction**: No hidden menus, no jargon, no distracting animations.
- **Privacy by Default**: Your queries and knowledge base never leave your device.

## 🛠️ Technology Stack

- **Framework**: [Next.js 15+](https://nextjs.org) (App Router)
- **Database**: [PGLite](https://pglite.dev) (Postgres in WASM) with `pgvector` support.
- **Embeddings**: [Transformers.js v3](https://huggingface.co/docs/transformers.js) using the `all-MiniLM-L6-v2` model.
- **Acceleration**: **WebGPU** for blazing fast on-device vector generation.
- **Persistence**: IndexedDB-backed storage via `idb://hujjah-vault`.

## 🚀 Key Features

- **Semantic Search**: Find relevant verses and hadiths based on meaning, not just keywords.
- **Ingestion Pipeline**: Import large datasets directly from your local machine:
  - **Quran**: Parse `.sql` dumps (Tanzil style).
  - **Hadith**: Ingest large `.csv` datasets (Sanadset) with tag-aware cleaning.
- **Hardware Adaptive**: Detects device capabilities to run in `FULL_LOCAL`, `HYBRID`, or `LITE` modes, ensuring smooth performance even on low-end Android devices.
- **Zero Latency**: Once seeded, searches happen in milliseconds without any network round-trips.

## 📥 Getting Started

### Prerequisites

- Node.js 18+
- A WebGPU-capable browser (Chrome, Edge, or recent Firefox)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/fazleyrabby/hujjah.git
   cd hujjah
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) and wait for the initial knowledge base to seed.

## 🏗️ Ingesting Data

Navigate to `/import` to migrate your verified Islamic datasets.
- For Quran: Upload `quran-uthmani.sql`.
- For Hadith: Upload `Sanadset.csv`.

Data is processed in batches to ensure the UI remains responsive and memory stable.

## 📜 License

This project is licensed under the MIT License - see the `LICENSE` file for details.

<!-- PROJECT LOGO / BANNER -->
<div align="center">
  <img src="https://via.placeholder.com/1200x400/0F172A/FFFFFF?text=SatQuery+AI+-+GeoAI+Intelligence+Platform" alt="SatQuery AI Banner" width="100%">
  
  <h1>SatQuery AI - GeoAI Intelligence Platform</h1>
  <p>
    <strong>An AI-powered geospatial intelligence platform for satellite querying, urban parcel mapping, and disaster analytics.</strong>
  </p>

  <!-- BADGES -->
  <p>
    <img src="https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python">
    <img src="https://img.shields.io/badge/FastAPI-0.100+-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI">
    <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React">
    <img src="https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E" alt="Vite">
    <img src="https://img.shields.io/badge/Groq-Free_Tier-FF6B6B?style=for-the-badge&logo=ai&logoColor=white" alt="Groq">
    <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="License">
  </p>
</div>

---

## 🌍 Overview

**SatQuery AI** is a comprehensive GeoAI Intelligence Platform designed to bridge the gap between complex satellite data and actionable insights. Built with a zero-cost architecture, it leverages open-source geospatial libraries and free-tier LLM APIs (Groq) to provide real-time weather intelligence, disaster risk assessment, and urban parcel mapping.

> 💡 **Zero-Cost Architecture:** This project is designed to run entirely on free tiers (Groq API, Cloudflare Tunnel, Local SQLite/PostGIS) without sacrificing performance.

---

## 🚀 Key Features

- **🛰️ SatQuery AI:** Query satellite imagery using natural language. "Show me the flood impact in Bhopal last week."
- **🗺️ Urban Parcel Mapping:** Automated extraction and visualization of urban parcels and land use.
- **🌪️ Disaster Intelligence:** Heuristic flood risk mapping and extreme weather event tracking.
- **🌦️ Weather Intelligence:** Live weather data integration with spatial overlays.
- **🤖 AI Map Copilot:** A conversational AI assistant that understands geospatial context and responds using the Groq (Llama 3 / GPT-OSS) model.
- **📊 Timeline & Compare Mode:** Scrub through historical data and compare two dates side-by-side.

---

## 🏗️ Architecture & Workflow

Here is how the data flows through the platform:

```mermaid
graph TD
    A[User / Web Browser] -->|Interacts| B(React Frontend + Vite)
    B -->|REST API Calls| C(FastAPI Backend)
    
    subgraph AI Layer
        C -->|Auth & Routing| D{AI Copilot Router}
        D -->|Primary Free Tier| E[Groq API - openai/gpt-oss-120b]
        D -.->|Optional Paid Fallback| F[Google Gemini API]
    end
    
    subgraph Data Layer
        C -->|Spatial Queries| G[(SQLite + SpatiaLite)]
        C -->|Satellite Imagery| H[Copernicus / Planetary Computer]
    end
    
    G -->|GeoJSON / Raster| C
    H -->|COG / Tiles| C
    E -->|LLM Response| C
    C -->|JSON Payload| B
    B -->|Render Map & UI| A

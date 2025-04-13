# Technical Specification Document

## <a id="english"></a>English

## <a id="chinese"></a>中文

---

## 1. Project Overview

### Brief Description

This project is an Electron-based desktop application that features interactive Live2D models, voice interaction, database management, and configuration settings, among other functionalities.

### Purpose and Goals

*   Provide a rich and interactive user experience through Live2D model integration.
*   Enable voice interaction for a more dynamic user interface.
*   Offer user-customizable settings and preferences.
*   Manage data locally using a built-in database.
*   Implement over-the-air application update.

---

## <a id="english"></a>English

## 2. Project Structure

### High-Level Overview
```
project-root/
├── LICENSE
├── README.md
├── dev-app-update.yml
├── electron-builder.yml
├── electron.vite.config.mjs
├── eslint.config.mjs
├── package.json
├── pnpm-lock.yaml
├── .vscode/
│   ├── extensions.json
│   ├── launch.json
│   └── settings.json
├── build/
│   ├── 1icon.icns
│   ├── entitlements.mac.plist
│   ├── icon.icns
│   ├── icon.ico
│   ├── icon.png
│   ├── trayicon.png
│   └── icons/
│        ├── mac/
│        └── png/
│        └── win/
├── resources/
│   ├── assets/
│   ├── dashang.jpg
│   ├── demo1.jpg
│   ├── icon.png
│   ├── mcpsetting.jpg
│   ├── models/
│   ├── live2d/
│   ├── show.mp4
│   ├── speech/
│   ├── trayicon.png
│   └── wechat.jpg
├── scripts/
│   └── postinstall.js
└── src/
    ├── main/
    │   └── index.js
    ├── preload/
    │   └── index.js
    ├── renderer/
    │   ├── index.html
    │   ├── src/
    │   └── router/
    └── utils/
        ├── database.js
        └── e-mcp-client.js
```
### Main Directories

*   **`src/`:** Contains the main application source code.
    *   **`src/main/`:** Contains the main process code for Electron.
    *   **`src/preload/`:** Contains the preload script for secure communication between renderer and main process.
    *   **`src/renderer/`:** Contains the renderer process code, which is the frontend of the application (Vue.js).
    *   **`src/utils/`:** Contains utility scripts such as database connection and MCP communication client.
*   **`resources/`:** Contains static assets such as images, Live2D models, videos, audio files and other resource data.
    *   **`resources/assets/`:** Store static image resources.
    *   **`resources/live2d/`:** Store Live2D related files, such as models.
    *   **`resources/models/`:** Store Live2D model data and resource.
    *   **`resources/speech/`:** Store speech related resources.
*   **`build/`:** Contains icons and configuration files related to building the application.
    *   **`build/icons/`:** Application icons for different platforms.
*   **`scripts/`:** Contains scripts for development or build process.
*   **`.vscode/`:** Contains vscode debug and settings.
* **root**
    * `electron.vite.config.mjs`, `electron-builder.yml` Store the electron configurations.
    * `package.json`, `pnpm-lock.yaml` Store the node package configurations.
    * `dev-app-update.yml`, `eslint.config.mjs`, `LICENSE`, `README.md` Store the other project configurations or instructions.

## 3. Technical Architecture

### Overall Architecture

The application employs a multi-process architecture, characteristic of Electron, separating the main process (Node.js environment) from the renderer process (browser environment). Vue.js handles the UI, and Live2D adds interactive models. Database and communication client handle other features.

### Technologies Used

*   **Electron:** Cross-platform desktop application framework.
*   **Vue.js:** Frontend JavaScript framework for building user interfaces.
*   **Live2D:** Technology for creating and animating 2D models.
*   **Node.js:** Backend JavaScript runtime environment.
* **sqlite** database.
* **JavaScript/ECMAScript**

### Component Interaction Diagram
```
mermaid
graph LR
    A[Main Process (Node.js)] -- Communicate --> B(Preload Script);
    B -- Access --> C[Renderer Process (Vue.js)];
    C -- Display --> D[Live2D Models];
    A -- Handle --> E[Database (SQLite)];
    A -- Control --> F[MCP Client];
    C -- Send --> G[Audio Recorder];
    C -- Use --> H[Speech Recognizer];
    style A fill:#f9f,stroke:#333,stroke-width:2px
    style B fill:#ccf,stroke:#333,stroke-width:2px
    style C fill:#cfc,stroke:#333,stroke-width:2px
    style D fill:#fcf,stroke:#333,stroke-width:2px
    style E fill:#ddf,stroke:#333,stroke-width:2px
    style F fill:#fdd,stroke:#333,stroke-width:2px
    style G fill:#ffd,stroke:#333,stroke-width:2px
    style H fill:#dfd,stroke:#333,stroke-width:2px
```
## 4. Module Breakdown

### Main Process Module (`src/main/`)

*   **Purpose:** Manages the application lifecycle, creates and controls browser windows, and handles OS-level interactions.
*   **Key Features:**
    *   Application launch and exit.
    *   Window creation and management.
    *   Inter-process communication (IPC) setup.
    *   Global shortcut management.
*   **File Path:** `src/main/index.js`

### Preload Module (`src/preload/`)

*   **Purpose:** Safely bridge communication between the renderer and main process.
*   **Key Features:**
    *   Exposes APIs to the renderer.
    *   Securely handles IPC calls.
*   **File Path:** `src/preload/index.js`

### Renderer Module (`src/renderer/`)

*   **Purpose:** Responsible for the user interface and user interaction.
*   **Key Features:**
    *   UI rendering (Vue.js).
    *   Handling user input.
    *   Displaying Live2D models.
    *   Displaying basic settings, version, MCP settings etc.
    *   Audio recorder function.
    *   Speech recognizer function.
*   **File Paths:**
    *   `src/renderer/index.html`
    * `src/renderer/src/*`
    * `src/renderer/src/components/*`
    * `src/renderer/src/router/index.js`

### Utils Module (`src/utils/`)

*   **Purpose:** Provide utility functions for database interaction and server communication.
*   **Key Features:**
    *   Database connection management.
    *   MCP server client.
*   **File Paths:**
    *   `src/utils/database.js`
    *   `src/utils/e-mcp-client.js`

### Live2D Module (`resources/live2d/`, `resources/models/`)

*   **Purpose:** Displays and animates Live2D models.
*   **Key Features:**
    *   Model loading and initialization.
    *   Motion playback.
    *   Physics simulation.
    *   Support for multiple models.
*   **File Paths:**
    *   `resources/live2d/*`
    *   `resources/models/*`

## 5. Major Components and Functionalities

### Components

*   **Main:**
    *   Manages the application lifecycle and windowing.
    *   Facilitates inter-process communication.
*   **Renderer:**
    *   Renders the user interface using Vue.js.
    *   Handles user interactions.
*   **Preload:**
    *   Provides a secure bridge between renderer and main processes.
    *   Exposes selected APIs to the renderer.
*   **Live2D:**
    *   Loads and displays Live2D models.
    *   Plays animations and reacts to user input.
*   **MCP Client:**
    *   Handles communication with the MCP server.
    *   Sends and receives data.
*   **Database:**
    *   Manages local data storage using SQLite.
    *   Provides data persistence.
*   **Speech:**
    *   Speech recognition.
    *   Voice command processing.
*   **Audio:**
    * Records the audio by the user's devices.
    * Play the voice files.

### Key Functionalities

*   **App:**
    *   Handles application start-up, shutdown, and updates.
    *   Manages multiple windows and overall application behavior.
*   **Basic Setting:**
    *   Allows users to customize basic application settings.
    *   Customizable options, such as window size, model position, etc.
*   **Versions:**
    *   Displays the current version of the application.
    *   Provides information about any updates.
*   **MCP Setting:**
    *   Allows users to configure the connection to the MCP server.
    *   Manage the MCP server address, port.
*   **Change Model:**
    *   Allows users to select and switch between different Live2D models.
    *   Provides a UI for browsing and selecting models.
*   **Audio Recorder:**
    *   Records audio input from the user's microphone.
    *   Saves the recorded audio to a file.
*   **Speech Recognizer:**
    *   Converts spoken audio into text.
    *   Processes voice commands for application control.

## 6. Other Notes

### Build Scripts

*   **`scripts/postinstall.js`:** A post-installation script that runs after npm or pnpm install.

### Configurations

*   **`electron.vite.config.mjs`:** Configuration file for the Electron-Vite build process.
*   **`electron-builder.yml`:** Configuration file for building and packaging the Electron application.
* **`dev-app-update.yml`:** Configurations for update.
* **`.vscode/extensions.json`, `.vscode/launch.json`, `.vscode/settings.json`:** vscode related configuration files.
* **`eslint.config.mjs`:** eslint configuration file.
* **`package.json`, `pnpm-lock.yaml`:** node package configuration files.

## 7. Technology Stack

*   **Electron**
*   **Vue.js**
*   **Live2D**
*   **Node.js**
* **JavaScript/ECMAScript**
*   **SQLite**
*   **HTML/CSS**
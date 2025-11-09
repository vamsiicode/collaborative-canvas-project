# Real-Time Collaborative Canvas

This is a multi-user drawing application, similar to a simplified Figma or Miro board, where multiple users can draw on the same canvas and see each other's updates in real-time.

This project was built to explore the challenges of real-time state synchronization, high-performance canvas rendering, and WebSocket communication.

## 🚀 How to Run

1.  **Install Dependencies:**
    ```bash
    npm install
    ```
2.  **Start the Server:**
    ```bash
    npm start
    ```
3.  Your app will be running at `http://localhost:3000`.

## 🧪 How to Test with Multiple Users

This is the fun part! The whole point is to test the real-time collaboration.

* **Easiest Way:** Open `http://localhost:3000` in two (or more) different browser tabs.
* **Best Way:** Open one tab in your normal browser and a second tab in an **Incognito** or **Private Window**. This simulates two completely separate users.
* **Pro-Level:** Open the URL on your phone (if it's on the same WiFi) to see desktop and mobile work together.

## ⚠️ Known Limitations & Bugs

This project's goal was to nail the performance and real-time sync, but that left a few things on the cutting room floor:

* **Global Undo/Redo:** The undo button is "global." If you draw, then I draw, and you hit "undo," it will undo *my* line (the last action). This is a simple-to-implement strategy but not ideal for a real product, which would require a complex "per-user" undo.
* **No Resize Handling:** The canvas size is set once on load. If you resize your browser window, the canvas *will not* resize with it, and new drawings will be misaligned. This is the biggest missing feature.
* **Eraser is Pixel-Based:** The eraser is just a brush that draws with "transparent." It doesn't erase an *entire stroke* as an object. If you don't erase a line completely, it's still there.
* **No Persistence:** All drawings are stored in server memory. If the server (your `npm start` process) restarts, all drawings are lost forever. A real app would save this history to a database.

## ⏰ Time Spent

* **Estimated time for this version:** 6 hours.
    * (Getting the basic drawing and WebSocket connection: 2 hours)
    * (Debugging the lag, disappearing lines, and race conditions: 4 hours 😅)
/// <reference types="vite/client" />

interface VSCodeAPI {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
}

declare global {
    function acquireVsCodeApi(): VSCodeAPI;
    interface Window {
        __WORKFLOW_DATA__?: any;
    }
}

export {};

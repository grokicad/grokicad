/*
    Grok API Service - handles streaming communication with the Grok AI backend.
    Extracted from grok-chat-panel.ts for better separation of concerns.
*/

import { GrokiAPI, type DistilledSchematic } from "../../services/api";
import type { SelectedComponent, GrokContext } from "./types";

// Configure API base URL
const BACKEND_URL = process.env["BACKEND_URL"];
const API_BASE_URL = BACKEND_URL ? `${BACKEND_URL}/api` : "/api";

/** Callback types for streaming events */
export interface StreamCallbacks {
    onStart?: () => void;
    onChunk?: (content: string) => void;
    onComplete?: (fullContent: string) => void;
    onError?: (error: string) => void;
}

/** Request payload for the Grok selection stream endpoint */
export interface GrokStreamRequest {
    repo: string;
    commit: string;
    component_ids: string[];
    query: string;
    distilled: DistilledSchematic;
}

/**
 * Service for interacting with the Grok AI backend.
 * Handles fetching distilled schematics and streaming AI responses.
 */
export class GrokAPIService {
    private _distilledSchematic: DistilledSchematic | null = null;
    private _abortController: AbortController | null = null;

    /**
     * Fetches and caches the distilled schematic for a repo/commit.
     */
    async getDistilledSchematic(
        repo: string,
        commit: string,
    ): Promise<DistilledSchematic> {
        if (!this._distilledSchematic) {
            this._distilledSchematic = await GrokiAPI.getDistilledSchematic(
                repo,
                commit,
            );
        }
        return this._distilledSchematic;
    }

    /**
     * Clears the cached distilled schematic.
     * Call this when the repo/commit changes.
     */
    clearCache(): void {
        this._distilledSchematic = null;
    }

    /**
     * Aborts any in-progress streaming request.
     */
    abort(): void {
        if (this._abortController) {
            this._abortController.abort();
            this._abortController = null;
        }
    }

    /**
     * Streams a query to the Grok AI backend and processes the response.
     *
     * @param context - Repository context (repo and commit)
     * @param components - Selected components to query about
     * @param query - The user's question
     * @param callbacks - Callbacks for streaming events
     * @returns Promise that resolves when streaming is complete
     */
    async streamQuery(
        context: GrokContext,
        components: SelectedComponent[],
        query: string,
        callbacks: StreamCallbacks,
    ): Promise<void> {
        const { repo, commit } = context;

        if (!repo || !commit) {
            callbacks.onError?.(
                "Repository context not available. Please load a schematic from GitHub.",
            );
            return;
        }

        // Abort any existing request
        this.abort();
        this._abortController = new AbortController();

        callbacks.onStart?.();

        try {
            // Fetch distilled schematic if needed
            const distilled = await this.getDistilledSchematic(repo, commit);

            const componentIds = components.map((c) => c.reference);

            const response = await fetch(
                `${API_BASE_URL}/grok/selection/stream`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Accept: "text/event-stream",
                    },
                    body: JSON.stringify({
                        repo,
                        commit,
                        component_ids: componentIds,
                        query,
                        distilled,
                    } satisfies GrokStreamRequest),
                    signal: this._abortController.signal,
                },
            );

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}: ${response.statusText}`,
                );
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let fullContent = "";

            if (reader) {
                let done = false;
                while (!done) {
                    const result = await reader.read();
                    done = result.done;

                    if (result.value) {
                        const chunk = decoder.decode(result.value);
                        const lines = chunk.split("\n");

                        for (const line of lines) {
                            if (line.startsWith("data: ")) {
                                const data = line.slice(6);

                                if (data === "[DONE]") {
                                    done = true;
                                    break;
                                } else if (data.startsWith("[ERROR:")) {
                                    callbacks.onError?.(data);
                                    done = true;
                                    break;
                                } else {
                                    fullContent += data;
                                    callbacks.onChunk?.(fullContent);
                                }
                            }
                        }
                    }
                }
            }

            callbacks.onComplete?.(fullContent);
        } catch (err) {
            // Don't report abort errors
            if (err instanceof Error && err.name === "AbortError") {
                return;
            }

            console.error("[GrokAPIService] Stream error:", err);
            callbacks.onError?.(
                err instanceof Error
                    ? err.message
                    : "Failed to connect to Grok AI",
            );
        } finally {
            this._abortController = null;
        }
    }
}

/** Singleton instance for convenience */
export const grokAPI = new GrokAPIService();

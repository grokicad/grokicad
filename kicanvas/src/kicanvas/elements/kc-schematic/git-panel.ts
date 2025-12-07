/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { delegate } from "../../../base/events";
import { css, html } from "../../../base/web-components";
import { KCUIElement } from "../../../kc-ui";
import { KiCanvasLoadEvent } from "../../../viewers/base/events";
import { SchematicViewer } from "../../../viewers/schematic/viewer";

// Mock commit data structure - will be replaced with API data
interface GitCommit {
    hash: string;
    shortHash: string;
    message: string;
    author: string;
    date: string;
    isCurrent?: boolean;
}

// Mock API response - replace with actual API call
async function fetchGitHistory(_filename: string): Promise<GitCommit[]> {
    // TODO: Replace with actual API call
    // Expected API endpoint: GET /api/git/history?file={filename}
    // Returns: Array of commits that modified this file

    // Mock data for now
    return [
        {
            hash: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0",
            shortHash: "a1b2c3d",
            message: "Fix power supply decoupling capacitors",
            author: "Alice Engineer",
            date: "2024-12-06T14:32:00Z",
            isCurrent: true,
        },
        {
            hash: "b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1",
            shortHash: "b2c3d4e",
            message: "Add USB-C connector and ESD protection",
            author: "Bob Designer",
            date: "2024-12-05T09:15:00Z",
        },
        {
            hash: "c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2",
            shortHash: "c3d4e5f",
            message: "Update MCU pin assignments for rev 2",
            author: "Alice Engineer",
            date: "2024-12-04T16:45:00Z",
        },
        {
            hash: "d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3",
            shortHash: "d4e5f6g",
            message: "Initial schematic layout",
            author: "Charlie Maker",
            date: "2024-12-01T10:00:00Z",
        },
    ];
}

function formatDate(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
        return "Today";
    } else if (days === 1) {
        return "Yesterday";
    } else if (days < 7) {
        return `${days} days ago`;
    } else {
        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
        });
    }
}

export class KCSchematicGitPanelElement extends KCUIElement {
    static override styles = [
        ...KCUIElement.styles,
        css`
            .commit-list {
                display: flex;
                flex-direction: column;
                gap: 0;
            }

            .commit-item {
                display: flex;
                flex-direction: column;
                padding: 0.75em 0.5em;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                cursor: pointer;
                transition: background 0.2s ease;
                position: relative;
            }

            .commit-item:hover {
                background: rgba(255, 206, 84, 0.1);
            }

            .commit-item.current {
                background: rgba(78, 205, 196, 0.1);
                border-left: 3px solid rgb(78, 205, 196);
            }

            .commit-item.current:hover {
                background: rgba(78, 205, 196, 0.15);
            }

            .commit-header {
                display: flex;
                align-items: center;
                gap: 0.5em;
                margin-bottom: 0.25em;
            }

            .commit-hash {
                font-family: "JetBrains Mono", "SF Mono", monospace;
                font-size: 0.85em;
                color: rgb(255, 206, 84);
                background: rgba(255, 206, 84, 0.15);
                padding: 0.1em 0.4em;
                border-radius: 3px;
            }

            .commit-date {
                font-size: 0.8em;
                color: rgba(255, 255, 255, 0.5);
                margin-left: auto;
            }

            .commit-message {
                font-size: 0.95em;
                color: rgba(255, 255, 255, 0.9);
                margin-bottom: 0.25em;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .commit-author {
                font-size: 0.8em;
                color: rgba(255, 255, 255, 0.5);
            }

            .current-badge {
                font-size: 0.7em;
                color: rgb(78, 205, 196);
                background: rgba(78, 205, 196, 0.2);
                padding: 0.1em 0.4em;
                border-radius: 3px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .timeline {
                position: absolute;
                left: 0.5em;
                top: 0;
                bottom: 0;
                width: 2px;
                background: rgba(255, 255, 255, 0.1);
            }

            .timeline-dot {
                position: absolute;
                left: 0.35em;
                top: 1em;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.3);
                border: 2px solid rgba(255, 255, 255, 0.1);
            }

            .commit-item.current .timeline-dot {
                background: rgb(78, 205, 196);
                border-color: rgba(78, 205, 196, 0.3);
            }

            .commit-content {
                padding-left: 1.5em;
            }

            .loading {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 2em;
                color: rgba(255, 255, 255, 0.5);
            }

            .empty-state {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 2em;
                color: rgba(255, 255, 255, 0.5);
                text-align: center;
            }

            .empty-state-icon {
                font-size: 2em;
                margin-bottom: 0.5em;
                opacity: 0.5;
            }
        `,
    ];

    viewer: SchematicViewer;
    commits: GitCommit[] = [];
    loading = true;
    error: string | null = null;

    override connectedCallback() {
        (async () => {
            this.viewer = await this.requestLazyContext("viewer");
            await this.viewer.loaded;
            super.connectedCallback();
            this.loadGitHistory();
            this.setupEvents();
        })();
    }

    private setupEvents() {
        // Reload git history when a different schematic is loaded
        this.addDisposable(
            this.viewer.addEventListener(KiCanvasLoadEvent.type, () => {
                this.loadGitHistory();
            }),
        );

        // Handle commit clicks via event delegation
        delegate(this.renderRoot, ".commit-item", "click", (e, source) => {
            const hash = source.getAttribute("data-hash");
            const commit = this.commits.find((c) => c.hash === hash);
            if (commit) {
                this.onCommitClick(commit);
            }
        });
    }

    private async loadGitHistory() {
        this.loading = true;
        this.error = null;
        this.update();

        try {
            // Get the filename from the schematic
            const filename =
                this.viewer.schematic?.filename ?? "unknown.kicad_sch";
            this.commits = await fetchGitHistory(filename);
        } catch (e) {
            this.error = "Failed to load git history";
            console.error("Git history error:", e);
        } finally {
            this.loading = false;
            this.update();
        }
    }

    private onCommitClick(commit: GitCommit) {
        // TODO: Implement commit selection
        // This could load a specific version of the schematic
        console.log("Selected commit:", commit.hash);

        // Dispatch event for parent components to handle
        this.dispatchEvent(
            new CustomEvent("git-commit-select", {
                detail: commit,
                bubbles: true,
                composed: true,
            }),
        );
    }

    override render() {
        if (this.loading) {
            return html`
                <kc-ui-panel>
                    <kc-ui-panel-title title="Git History"></kc-ui-panel-title>
                    <kc-ui-panel-body>
                        <div class="loading">Loading git history...</div>
                    </kc-ui-panel-body>
                </kc-ui-panel>
            `;
        }

        if (this.error) {
            return html`
                <kc-ui-panel>
                    <kc-ui-panel-title title="Git History"></kc-ui-panel-title>
                    <kc-ui-panel-body>
                        <div class="empty-state">
                            <div class="empty-state-icon">⚠️</div>
                            <div>${this.error}</div>
                        </div>
                    </kc-ui-panel-body>
                </kc-ui-panel>
            `;
        }

        if (this.commits.length === 0) {
            return html`
                <kc-ui-panel>
                    <kc-ui-panel-title title="Git History"></kc-ui-panel-title>
                    <kc-ui-panel-body>
                        <div class="empty-state">
                            <div class="empty-state-icon">📁</div>
                            <div>No git history found for this file</div>
                        </div>
                    </kc-ui-panel-body>
                </kc-ui-panel>
            `;
        }

        const commitItems = this.commits.map(
            (commit) => html`
                <div
                    class="commit-item ${commit.isCurrent ? "current" : ""}"
                    data-hash="${commit.hash}">
                    <div class="timeline"></div>
                    <div class="timeline-dot"></div>
                    <div class="commit-content">
                        <div class="commit-header">
                            <span class="commit-hash">${commit.shortHash}</span>
                            ${commit.isCurrent
                                ? html`<span class="current-badge"
                                      >Current</span
                                  >`
                                : null}
                            <span class="commit-date"
                                >${formatDate(commit.date)}</span
                            >
                        </div>
                        <div class="commit-message">${commit.message}</div>
                        <div class="commit-author">${commit.author}</div>
                    </div>
                </div>
            `,
        );

        return html`
            <kc-ui-panel>
                <kc-ui-panel-title title="Git History"></kc-ui-panel-title>
                <kc-ui-panel-body>
                    <div class="commit-list">${commitItems}</div>
                </kc-ui-panel-body>
            </kc-ui-panel>
        `;
    }
}

window.customElements.define(
    "kc-schematic-git-panel",
    KCSchematicGitPanelElement,
);


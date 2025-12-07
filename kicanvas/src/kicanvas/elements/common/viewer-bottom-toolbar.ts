/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import { css, html } from "../../../base/web-components";
import { KCUIElement, type KCUIButtonElement } from "../../../kc-ui";
import {
    KiCanvasMouseMoveEvent,
    KiCanvasSelectEvent,
} from "../../../viewers/base/events";
import type { Viewer } from "../../../viewers/base/viewer";
import type { Project } from "../../project";
import { grokAPI } from "../../elements/grok/grok-api-service";

export class KCViewerBottomToolbarElement extends KCUIElement {
    static override styles = [
        ...KCUIElement.styles,
        css`
            output {
                width: unset;
                margin: unset;
                padding: 0.5em;
                color: var(--button-toolbar-fg);
                background: var(--button-toolbar-bg);
                border: 1px solid var(--button-toolbar-bg);
                border-radius: 0.25em;
                font-weight: 300;
                font-size: 0.9em;
                box-shadow: var(--input-hover-shadow);
                user-select: none;
            }
        `,
    ];

    viewer: Viewer;
    project: Project;
    #repoInfo: { repo: string | null; commit: string | null };
    #position_elm: HTMLOutputElement;
    #zoom_to_page_btn: KCUIButtonElement;
    #zoom_to_selection_btn: KCUIButtonElement;
    #download_btn: KCUIButtonElement;
    #clear_cache_btn: KCUIButtonElement;

    override connectedCallback() {
        (async () => {
            this.viewer = await this.requestLazyContext("viewer");
            this.project = await this.requestContext("project");

            // Get repo info context
            try {
                this.#repoInfo = (await this.requestLazyContext("repoInfo")) as {
                    repo: string | null;
                    commit: string | null;
                };
            } catch {
                // No repo info available (local file)
                this.#repoInfo = { repo: null, commit: null };
            }

            await this.viewer.loaded;

            super.connectedCallback();

            this.addDisposable(
                this.viewer.addEventListener(
                    KiCanvasMouseMoveEvent.type,
                    () => {
                        this.update_position();
                    },
                ),
            );
            this.addDisposable(
                this.viewer.addEventListener(KiCanvasSelectEvent.type, (e) => {
                    this.#zoom_to_selection_btn.disabled = e.detail.item
                        ? false
                        : true;
                }),
            );

            this.#zoom_to_page_btn.addEventListener("click", (e) => {
                e.preventDefault();
                this.viewer.zoom_to_page();
            });
            this.#zoom_to_selection_btn.addEventListener("click", (e) => {
                e.preventDefault();
                this.viewer.zoom_to_selection();
            });
            this.#download_btn.addEventListener("click", (e) => {
                e.preventDefault();
                if (this.project.active_page) {
                    this.project.download(this.project.active_page.filename);
                }
            });

            this.#clear_cache_btn.addEventListener("click", async (e) => {
                e.preventDefault();
                if (this.#repoInfo.repo) {
                    try {
                        this.#clear_cache_btn.disabled = true;
                        await grokAPI.clearServerCache(this.#repoInfo.repo);
                        // Could show a toast notification here, but for now just re-enable
                        console.log("Cache cleared successfully");
                    } catch (err) {
                        console.error("Failed to clear cache:", err);
                    } finally {
                        this.#clear_cache_btn.disabled = false;
                    }
                }
            });
        })();
    }

    private update_position() {
        const pos = this.viewer.mouse_position;
        this.#position_elm.value = `${pos.x.toFixed(2)}, ${pos.y.toFixed(
            2,
        )} mm`;
    }

    override render() {
        this.#position_elm = html`<output
            slot="left"
            class="toolbar"></output>` as HTMLOutputElement;

        this.#download_btn = html`<kc-ui-button
            slot="right"
            variant="toolbar"
            name="download"
            title="download"
            icon="download">
        </kc-ui-button>` as KCUIButtonElement;

        this.#zoom_to_page_btn = html`<kc-ui-button
            slot="right"
            variant="toolbar"
            name="zoom_to_page"
            title="zoom to page"
            icon="svg:zoom_page">
        </kc-ui-button>` as KCUIButtonElement;

        this.#zoom_to_selection_btn = html` <kc-ui-button
            slot="right"
            variant="toolbar"
            name="zoom_to_selection"
            title="zoom to selection"
            icon="svg:zoom_footprint"
            disabled>
        </kc-ui-button>` as KCUIButtonElement;

        this.#clear_cache_btn = html`<kc-ui-button
            slot="right"
            variant="toolbar"
            name="clear_cache"
            title="clear grok cache"
            icon="delete">
        </kc-ui-button>` as KCUIButtonElement;

        this.update_position();

        return html`<kc-ui-floating-toolbar location="bottom">
            ${this.#position_elm} ${this.#download_btn} ${this.#zoom_to_selection_btn}
            ${this.#zoom_to_page_btn} ${this.#clear_cache_btn}
        </kc-ui-floating-toolbar>`;
    }
}

window.customElements.define(
    "kc-viewer-bottom-toolbar",
    KCViewerBottomToolbarElement,
);

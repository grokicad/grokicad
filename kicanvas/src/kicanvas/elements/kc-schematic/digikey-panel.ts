/*
    DigiKey Part Information Panel
    Shows DigiKey part data when a component is selected, including
    availability, pricing, and most importantly - obsolescence status.
*/

import { css, html } from "../../../base/web-components";
import { KCUIElement } from "../../../kc-ui";
import { SchematicSymbol } from "../../../kicad/schematic";
import {
    KiCanvasLoadEvent,
    KiCanvasSelectEvent,
} from "../../../viewers/base/events";
import { SchematicViewer } from "../../../viewers/schematic/viewer";
import type {
    DigiKeyPartInfo,
    DigiKeySearchResponse,
} from "../../services/api";
import { GrokiAPI } from "../../services/api";

type SearchState = "idle" | "loading" | "success" | "error" | "not_configured";

export class KCSchematicDigiKeyPanelElement extends KCUIElement {
    static override styles = [
        ...KCUIElement.styles,
        css`
            :host {
                display: block;
                height: 100%;
            }

            .loading {
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 2em;
                color: var(--panel-subtitle-fg);
            }

            .loading-spinner {
                width: 24px;
                height: 24px;
                border: 3px solid var(--panel-subtitle-bg);
                border-top-color: var(--accent);
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-right: 0.5em;
            }

            @keyframes spin {
                to {
                    transform: rotate(360deg);
                }
            }

            .error-message {
                padding: 1em;
                color: #f87171;
                background: rgba(248, 113, 113, 0.1);
                border-radius: 4px;
                margin: 0.5em;
                font-size: 0.9em;
            }

            .not-configured {
                padding: 1em;
                color: #fbbf24;
                background: rgba(251, 191, 36, 0.1);
                border-radius: 4px;
                margin: 0.5em;
                font-size: 0.9em;
            }

            .part-card {
                border: 1px solid var(--panel-subtitle-bg);
                border-radius: 6px;
                margin: 0.5em;
                overflow: hidden;
            }

            .part-header {
                padding: 0.75em;
                background: var(--panel-subtitle-bg);
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                gap: 0.5em;
            }

            .part-mpn {
                font-weight: 600;
                font-size: 1.1em;
                color: var(--panel-fg);
                word-break: break-word;
            }

            .part-manufacturer {
                font-size: 0.85em;
                color: var(--panel-subtitle-fg);
                margin-top: 0.25em;
            }

            .status-badge {
                flex-shrink: 0;
                padding: 0.25em 0.5em;
                border-radius: 4px;
                font-size: 0.75em;
                font-weight: 600;
                text-transform: uppercase;
            }

            .status-active {
                background: rgba(34, 197, 94, 0.2);
                color: #22c55e;
            }

            .status-obsolete {
                background: rgba(239, 68, 68, 0.2);
                color: #ef4444;
            }

            .status-nrnd {
                background: rgba(251, 191, 36, 0.2);
                color: #fbbf24;
            }

            .status-unknown {
                background: rgba(156, 163, 175, 0.2);
                color: #9ca3af;
            }

            .part-body {
                padding: 0.75em;
            }

            .part-description {
                font-size: 0.9em;
                color: var(--panel-fg);
                margin-bottom: 0.75em;
                line-height: 1.4;
            }

            .part-stats {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 0.5em;
                margin-bottom: 0.75em;
            }

            .stat-item {
                display: flex;
                flex-direction: column;
            }

            .stat-label {
                font-size: 0.75em;
                color: var(--panel-subtitle-fg);
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }

            .stat-value {
                font-size: 0.95em;
                font-weight: 500;
                color: var(--panel-fg);
            }

            .stat-value.in-stock {
                color: #22c55e;
            }

            .stat-value.low-stock {
                color: #fbbf24;
            }

            .stat-value.out-of-stock {
                color: #ef4444;
            }

            .part-links {
                display: flex;
                gap: 0.5em;
                flex-wrap: wrap;
            }

            .part-link {
                display: inline-flex;
                align-items: center;
                gap: 0.25em;
                padding: 0.4em 0.75em;
                background: var(--button-bg, #374151);
                color: var(--button-fg, #e5e7eb);
                text-decoration: none;
                border-radius: 4px;
                font-size: 0.85em;
                transition: background 0.15s;
            }

            .part-link:hover {
                background: var(--button-hover-bg, #4b5563);
            }

            .part-link kc-ui-icon {
                font-size: 1.1em;
            }

            .parameters-section {
                margin-top: 0.75em;
                border-top: 1px solid var(--panel-subtitle-bg);
                padding-top: 0.75em;
            }

            .parameters-title {
                font-size: 0.8em;
                color: var(--panel-subtitle-fg);
                text-transform: uppercase;
                letter-spacing: 0.05em;
                margin-bottom: 0.5em;
            }

            .parameters-grid {
                display: grid;
                gap: 0.25em;
            }

            .parameter-row {
                display: flex;
                justify-content: space-between;
                font-size: 0.85em;
                padding: 0.2em 0;
            }

            .parameter-name {
                color: var(--panel-subtitle-fg);
            }

            .parameter-value {
                color: var(--panel-fg);
                font-weight: 500;
                text-align: right;
            }

            .no-results {
                padding: 1em;
                text-align: center;
                color: var(--panel-subtitle-fg);
            }

            .part-photo {
                width: 60px;
                height: 60px;
                object-fit: contain;
                background: #fff;
                border-radius: 4px;
                margin-right: 0.75em;
            }

            .part-header-content {
                flex: 1;
                min-width: 0;
            }

            .part-header-left {
                display: flex;
                align-items: flex-start;
                flex: 1;
                min-width: 0;
            }

            .refresh-button {
                display: inline-flex;
                align-items: center;
                gap: 0.25em;
                padding: 0.4em 0.75em;
                background: var(--button-bg, #374151);
                color: var(--button-fg, #e5e7eb);
                border: none;
                border-radius: 4px;
                font-size: 0.85em;
                cursor: pointer;
                transition: background 0.15s;
            }

            .refresh-button:hover {
                background: var(--button-hover-bg, #4b5563);
            }

            .selected-part-info {
                padding: 0.5em;
                margin: 0.5em;
                background: var(--panel-subtitle-bg);
                border-radius: 4px;
                font-size: 0.9em;
            }

            .selected-part-info strong {
                color: var(--panel-fg);
            }
        `,
    ];

    viewer: SchematicViewer;
    selected_item?: SchematicSymbol;
    search_state: SearchState = "idle";
    search_result?: DigiKeySearchResponse;
    digikey_configured = false;

    override connectedCallback() {
        (async () => {
            this.viewer = await this.requestLazyContext("viewer");
            await this.viewer.loaded;
            super.connectedCallback();
            this.setup_events();
            await this.check_configuration();
        })();
    }

    private async check_configuration() {
        const status = await GrokiAPI.getDigiKeyStatus();
        this.digikey_configured = status.configured;
        if (!status.configured) {
            this.search_state = "not_configured";
        }
        this.update();
    }

    override renderedCallback() {
        // Bind retry button click after each render
        const retryBtn = this.renderRoot.querySelector("#retry-btn");
        if (retryBtn) {
            retryBtn.addEventListener("click", () => this.search_for_part());
        }
    }

    private setup_events() {
        this.addDisposable(
            this.viewer.addEventListener(KiCanvasSelectEvent.type, (e) => {
                const item = e.detail.item;
                if (item instanceof SchematicSymbol) {
                    this.selected_item = item;
                    if (this.digikey_configured) {
                        this.search_for_part();
                    }
                } else {
                    this.selected_item = undefined;
                    this.search_result = undefined;
                    this.search_state = this.digikey_configured
                        ? "idle"
                        : "not_configured";
                }
                this.update();
            }),
        );

        this.addDisposable(
            this.viewer.addEventListener(KiCanvasLoadEvent.type, () => {
                this.selected_item = undefined;
                this.search_result = undefined;
                this.search_state = this.digikey_configured
                    ? "idle"
                    : "not_configured";
                this.update();
            }),
        );
    }

    private async search_for_part() {
        if (!this.selected_item || !this.digikey_configured) return;

        // Try to extract a useful search query from the component
        const mpn = this.extract_mpn(this.selected_item);
        if (!mpn) {
            this.search_state = "idle";
            this.search_result = undefined;
            this.update();
            return;
        }

        this.search_state = "loading";
        this.update();

        try {
            // Search by MPN first for better results
            this.search_result = await GrokiAPI.searchDigiKey(mpn, mpn);

            if (this.search_result.success) {
                this.search_state = "success";
            } else {
                this.search_state = "error";
            }
        } catch {
            this.search_state = "error";
            this.search_result = {
                query: mpn,
                success: false,
                error: "Failed to search DigiKey",
                parts: [],
                total_count: 0,
            };
        }

        this.update();
    }

    private extract_mpn(symbol: SchematicSymbol): string | null {
        // Try common property names for manufacturer part number
        const mpn_properties = [
            "MPN",
            "Manufacturer Part Number",
            "PartNumber",
            "Part Number",
            "Part_Number",
            "Part",
            "Value",
            "Mfr. #",
            "Mfr Part #",
        ];

        for (const prop_name of mpn_properties) {
            const prop = symbol.properties.get(prop_name);
            if (prop?.text && prop.text.trim() && prop.text !== "~") {
                return prop.text.trim();
            }
        }

        // Fall back to lib_id or lib_name if no MPN found
        if (symbol.lib_name && symbol.lib_name !== "~") {
            return symbol.lib_name;
        }

        return null;
    }

    private get_status_class(part: DigiKeyPartInfo): string {
        if (part.is_obsolete) return "status-obsolete";
        const status = (part.product_status || "").toLowerCase();
        if (
            status.includes("active") ||
            status.includes("in production")
        ) {
            return "status-active";
        }
        if (
            status.includes("not recommended") ||
            status.includes("nrnd") ||
            status.includes("last time buy")
        ) {
            return "status-nrnd";
        }
        return "status-unknown";
    }

    private get_status_text(part: DigiKeyPartInfo): string {
        if (part.is_obsolete) return "Obsolete";
        const status = part.lifecycle_status || part.product_status;
        if (!status) return "Unknown";
        // Shorten common statuses
        if (status.toLowerCase().includes("active")) return "Active";
        if (status.toLowerCase().includes("not recommended"))
            return "NRND";
        return status;
    }

    private get_stock_class(qty: number | null): string {
        if (qty === null) return "";
        if (qty === 0) return "out-of-stock";
        if (qty < 100) return "low-stock";
        return "in-stock";
    }

    private format_price(price: number | null): string {
        if (price === null) return "—";
        return `$${price.toFixed(4)}`;
    }

    private format_stock(qty: number | null): string {
        if (qty === null) return "—";
        if (qty === 0) return "Out of Stock";
        return qty.toLocaleString();
    }

    private render_part_card(part: DigiKeyPartInfo) {
        const important_params = part.parameters.slice(0, 6);

        return html`
            <div class="part-card">
                <div class="part-header">
                    <div class="part-header-left">
                        ${part.photo_url
                            ? html`<img
                                  class="part-photo"
                                  src="${part.photo_url}"
                                  alt="${part.manufacturer_part_number || ""}"
                                  loading="lazy" />`
                            : ""}
                        <div class="part-header-content">
                            <div class="part-mpn">
                                ${part.manufacturer_part_number ||
                                part.digikey_part_number ||
                                "Unknown Part"}
                            </div>
                            <div class="part-manufacturer">
                                ${part.manufacturer || "Unknown Manufacturer"}
                            </div>
                        </div>
                    </div>
                    <span
                        class="status-badge ${this.get_status_class(part)}">
                        ${this.get_status_text(part)}
                    </span>
                </div>
                <div class="part-body">
                    ${part.description
                        ? html`<div class="part-description">
                              ${part.description}
                          </div>`
                        : ""}

                    <div class="part-stats">
                        <div class="stat-item">
                            <span class="stat-label">Unit Price</span>
                            <span class="stat-value">
                                ${this.format_price(part.unit_price)}
                            </span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-label">In Stock</span>
                            <span
                                class="stat-value ${this.get_stock_class(
                                    part.quantity_available,
                                )}">
                                ${this.format_stock(part.quantity_available)}
                            </span>
                        </div>
                        ${part.category
                            ? html`
                                  <div class="stat-item">
                                      <span class="stat-label">Category</span>
                                      <span class="stat-value"
                                          >${part.category}</span
                                      >
                                  </div>
                              `
                            : ""}
                        ${part.digikey_part_number
                            ? html`
                                  <div class="stat-item">
                                      <span class="stat-label">DigiKey #</span>
                                      <span class="stat-value"
                                          >${part.digikey_part_number}</span
                                      >
                                  </div>
                              `
                            : ""}
                    </div>

                    <div class="part-links">
                        ${part.product_url
                            ? html`<a
                                  class="part-link"
                                  href="${part.product_url}"
                                  target="_blank"
                                  rel="noopener noreferrer">
                                  <kc-ui-icon>open_in_new</kc-ui-icon>
                                  DigiKey Page
                              </a>`
                            : ""}
                        ${part.datasheet_url
                            ? html`<a
                                  class="part-link"
                                  href="${part.datasheet_url}"
                                  target="_blank"
                                  rel="noopener noreferrer">
                                  <kc-ui-icon>description</kc-ui-icon>
                                  Datasheet
                              </a>`
                            : ""}
                    </div>

                    ${important_params.length > 0
                        ? html`
                              <div class="parameters-section">
                                  <div class="parameters-title">
                                      Key Specifications
                                  </div>
                                  <div class="parameters-grid">
                                      ${important_params.map(
                                          (p) => html`
                                              <div class="parameter-row">
                                                  <span class="parameter-name"
                                                      >${p.name}</span
                                                  >
                                                  <span class="parameter-value"
                                                      >${p.value}</span
                                                  >
                                              </div>
                                          `,
                                      )}
                                  </div>
                              </div>
                          `
                        : ""}
                </div>
            </div>
        `;
    }

    override render() {
        let content;

        switch (this.search_state) {
            case "not_configured":
                content = html`
                    <div class="not-configured">
                        <strong>DigiKey API Not Configured</strong>
                        <p>
                            To enable DigiKey integration, set the following
                            environment variables on the backend:
                        </p>
                        <ul>
                            <li>DIGIKEY_CLIENT_ID</li>
                            <li>DIGIKEY_CLIENT_SECRET</li>
                        </ul>
                        <p>
                            Visit
                            <a
                                href="https://developer.digikey.com"
                                target="_blank"
                                rel="noopener"
                                >developer.digikey.com</a
                            >
                            to get API credentials.
                        </p>
                    </div>
                `;
                break;

            case "loading":
                content = html`
                    <div class="loading">
                        <div class="loading-spinner"></div>
                        Searching DigiKey...
                    </div>
                `;
                break;

            case "error":
                content = html`
                    <div class="error-message">
                        <strong>Search Error</strong>
                        <p>${this.search_result?.error || "Unknown error"}</p>
                        <button class="refresh-button" id="retry-btn">
                            <kc-ui-icon>refresh</kc-ui-icon>
                            Retry
                        </button>
                    </div>
                `;
                break;

            case "success":
                if (
                    !this.search_result ||
                    this.search_result.parts.length === 0
                ) {
                    content = html`
                        <div class="no-results">
                            <p>No parts found for "${this.search_result?.query}"</p>
                            <p style="font-size: 0.85em; margin-top: 0.5em;">
                                Try checking if the part number is correct
                            </p>
                        </div>
                    `;
                } else {
                    content = html`
                        ${this.search_result.parts.map((p) =>
                            this.render_part_card(p),
                        )}
                    `;
                }
                break;

            default:
                if (this.selected_item) {
                    const mpn = this.extract_mpn(this.selected_item);
                    if (!mpn) {
                        content = html`
                            <div class="no-results">
                                <p>No part number found for this component</p>
                                <p style="font-size: 0.85em; margin-top: 0.5em;">
                                    Add an MPN or Value property to enable
                                    DigiKey lookup
                                </p>
                            </div>
                        `;
                    } else {
                        // Component with MPN selected but search not yet started
                        content = html`
                            <div class="loading">
                                <div class="loading-spinner"></div>
                                Preparing search...
                            </div>
                        `;
                    }
                } else {
                    content = html`
                        <kc-ui-property-list>
                            <kc-ui-property-list-item
                                class="label"
                                name="Select a component to look up on DigiKey">
                            </kc-ui-property-list-item>
                        </kc-ui-property-list>
                    `;
                }
        }

        return html`
            <kc-ui-panel>
                <kc-ui-panel-title title="DigiKey"></kc-ui-panel-title>
                <kc-ui-panel-body>${content}</kc-ui-panel-body>
            </kc-ui-panel>
        `;
    }
}

window.customElements.define(
    "kc-schematic-digikey-panel",
    KCSchematicDigiKeyPanelElement,
);

/*
    API service for communicating with the groki backend.
    Handles fetching commit history, schematic files at specific commits, etc.
*/

// Configure API base URL - can be overridden for different environments
// Uses BACKEND_URL environment variable (set via BACKEND_IP and BACKEND_PORT in .env)
// Falls back to localhost if not set
const BACKEND_URL = process.env["BACKEND_URL"];
const API_BASE_URL = BACKEND_URL ? `${BACKEND_URL}/api` : "/api";

console.log(`[API] Using backend URL: ${API_BASE_URL}`);

// ============================================================================
// DigiKey Types
// ============================================================================

export interface DigiKeyParameter {
    name: string;
    value: string;
}

export interface DigiKeyPartInfo {
    digikey_part_number: string | null;
    manufacturer_part_number: string | null;
    manufacturer: string | null;
    description: string | null;
    detailed_description: string | null;
    product_url: string | null;
    datasheet_url: string | null;
    photo_url: string | null;
    quantity_available: number | null;
    unit_price: number | null;
    product_status: string | null;
    is_obsolete: boolean;
    lifecycle_status: string | null;
    category: string | null;
    parameters: DigiKeyParameter[];
}

export interface DigiKeySearchResponse {
    query: string;
    success: boolean;
    error: string | null;
    parts: DigiKeyPartInfo[];
    total_count: number;
}

export interface DigiKeyStatusResponse {
    configured: boolean;
    message: string;
}

export interface GrokObsoleteReplacementRequest {
    manufacturer_part_number: string;
    manufacturer: string | null;
    description: string | null;
    category: string | null;
    datasheet_url: string | null;
    product_url: string | null;
    parameters: DigiKeyParameter[];
}

export interface GrokObsoleteReplacementResponse {
    original_part: string;
    analysis: string;
    success: boolean;
    error: string | null;
}

export interface CommitInfo {
    commit_hash: string;
    commit_date: string | null;
    message: string | null;
    has_schematic_changes: boolean;
}

export interface RepoCommitsResponse {
    repo: string;
    commits: CommitInfo[];
}

export interface SchematicFile {
    path: string;
    content: string;
}

export interface CommitFilesResponse {
    repo: string;
    commit: string;
    files: SchematicFile[];
}

export interface CommitInfoResponse {
    repo: string;
    commit: string;
    commit_date: string | null;
    message: string | null;
    blurb: string | null;
    description: string | null;
    changed_files: string[];
}

export interface DistillResponse {
    repo: string;
    commit: string;
    cached: boolean;
    distilled: DistilledSchematic;
}

export interface DistilledSchematic {
    components: DistilledComponent[];
    nets: Record<string, Record<string, { Pin: string }[]>>;
    proximities: ProximityEdge[];
}

export interface DistilledComponent {
    reference: string;
    lib_id: string;
    value: string;
    position: { x: number; y: number };
    footprint: string | null;
    properties: Record<string, string>;
    category: string;
    pins: DistilledPin[];
    sheet_path?: string;
}

export interface DistilledPin {
    number: string;
    name: string | null;
    net: string | null;
}

export interface ProximityEdge {
    ref_a: string;
    ref_b: string;
    distance_mm: number;
    score: number;
    category_a: string;
    category_b: string;
    weight: number;
}

export interface GrokSelectionRequest {
    repo: string;
    commit: string;
    component_ids: string[];
    query: string;
}

export class GrokiAPI {
    private static baseUrl = API_BASE_URL;

    /**
     * Set the API base URL (useful for testing or different environments)
     */
    static setBaseUrl(url: string): void {
        this.baseUrl = url;
    }

    /**
     * Get all commits that modified .kicad_sch files in a repository
     */
    static async getCommits(repo: string): Promise<CommitInfo[]> {
        try {
            const response = await fetch(`${this.baseUrl}/repo/commits`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ repo }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                throw new Error(
                    `Failed to fetch commits: ${response.status} ${
                        response.statusText
                    }${errorText ? ` - ${errorText}` : ""}`,
                );
            }

            const data: RepoCommitsResponse = await response.json();
            return data.commits;
        } catch (e) {
            if (e instanceof TypeError && e.message.includes("fetch")) {
                throw new Error(
                    `Cannot connect to API at ${this.baseUrl}. Is the backend running?`,
                );
            }
            throw e;
        }
    }

    /**
     * Get all .kicad_sch files at a specific commit
     */
    static async getCommitFiles(
        repo: string,
        commit: string,
    ): Promise<SchematicFile[]> {
        try {
            const response = await fetch(`${this.baseUrl}/repo/commit/files`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ repo, commit }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                throw new Error(
                    `Failed to fetch commit files: ${response.status} ${
                        response.statusText
                    }${errorText ? ` - ${errorText}` : ""}`,
                );
            }

            const data: CommitFilesResponse = await response.json();
            return data.files;
        } catch (e) {
            if (e instanceof TypeError && e.message.includes("fetch")) {
                throw new Error(
                    `Cannot connect to API at ${this.baseUrl}. Is the backend running?`,
                );
            }
            throw e;
        }
    }

    /**
     * Get detailed information about a specific commit
     */
    static async getCommitInfo(
        repo: string,
        commit: string,
    ): Promise<CommitInfoResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/repo/commit/info`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ repo, commit }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                throw new Error(
                    `Failed to fetch commit info: ${response.status} ${
                        response.statusText
                    }${errorText ? ` - ${errorText}` : ""}`,
                );
            }

            return await response.json();
        } catch (e) {
            if (e instanceof TypeError && e.message.includes("fetch")) {
                throw new Error(
                    `Cannot connect to API at ${this.baseUrl}. Is the backend running?`,
                );
            }
            throw e;
        }
    }

    /**
     * Get distilled schematic data for a specific commit
     */
    static async getDistilledSchematic(
        repo: string,
        commit: string,
    ): Promise<DistilledSchematic> {
        try {
            const response = await fetch(`${this.baseUrl}/distill`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ repo, commit }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                throw new Error(
                    `Failed to fetch distilled schematic: ${response.status} ${
                        response.statusText
                    }${errorText ? ` - ${errorText}` : ""}`,
                );
            }

            const data: DistillResponse = await response.json();
            return data.distilled;
        } catch (e) {
            if (e instanceof TypeError && e.message.includes("fetch")) {
                throw new Error(
                    `Cannot connect to API at ${this.baseUrl}. Is the backend running?`,
                );
            }
            throw e;
        }
    }

    /**
     * Create an EventSource for streaming Grok selection analysis
     * Returns the URL to connect to - caller manages the EventSource
     */
    static getGrokSelectionStreamUrl(
        repo: string,
        commit: string,
        componentIds: string[],
        query: string,
    ): string {
        const params = new URLSearchParams({
            repo,
            commit,
            query,
            component_ids: componentIds.join(","),
        });
        return `${this.baseUrl}/grok/selection/stream?${params.toString()}`;
    }

    /**
     * Extract repo identifier from a GitHub URL
     * e.g., "https://github.com/owner/repo" -> "owner/repo"
     */
    static extractRepoFromUrl(url: string): string | null {
        try {
            const parsed = new URL(url, "https://github.com");
            const pathParts = parsed.pathname.split("/").filter(Boolean);

            if (pathParts.length >= 2) {
                return `${pathParts[0]}/${pathParts[1]}`;
            }
            return null;
        } catch {
            return null;
        }
    }

    // ========================================================================
    // DigiKey API Methods
    // ========================================================================

    /**
     * Check if DigiKey integration is configured on the backend
     */
    static async getDigiKeyStatus(): Promise<DigiKeyStatusResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/digikey/status`, {
                method: "GET",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) {
                return {
                    configured: false,
                    message: `Failed to check DigiKey status: ${response.status}`,
                };
            }

            return await response.json();
        } catch (e) {
            return {
                configured: false,
                message:
                    e instanceof Error
                        ? e.message
                        : "Failed to connect to backend",
            };
        }
    }

    /**
     * Search DigiKey for part information
     * @param query - Search query (part number, keyword, etc.)
     * @param mpn - Optional manufacturer part number for more precise search
     */
    static async searchDigiKey(
        query: string,
        mpn?: string,
    ): Promise<DigiKeySearchResponse> {
        try {
            const response = await fetch(`${this.baseUrl}/digikey/search`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ query, mpn }),
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                return {
                    query: mpn || query,
                    success: false,
                    error: `Search failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`,
                    parts: [],
                    total_count: 0,
                };
            }

            return await response.json();
        } catch (e) {
            return {
                query: mpn || query,
                success: false,
                error:
                    e instanceof Error
                        ? e.message
                        : "Failed to connect to backend",
                parts: [],
                total_count: 0,
            };
        }
    }

    // ========================================================================
    // Grok AI Methods
    // ========================================================================

    /**
     * Find replacement parts for an obsolete component using Grok AI
     * @param part - The obsolete DigiKey part information
     */
    static async findObsoleteReplacement(
        part: DigiKeyPartInfo,
    ): Promise<GrokObsoleteReplacementResponse> {
        try {
            const request: GrokObsoleteReplacementRequest = {
                manufacturer_part_number:
                    part.manufacturer_part_number || "Unknown",
                manufacturer: part.manufacturer,
                description: part.description,
                category: part.category,
                datasheet_url: part.datasheet_url,
                product_url: part.product_url,
                parameters: part.parameters,
            };

            const response = await fetch(
                `${this.baseUrl}/grok/obsolete/replacement`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(request),
                },
            );

            if (!response.ok) {
                const errorText = await response.text().catch(() => "");
                return {
                    original_part: part.manufacturer_part_number || "Unknown",
                    analysis: "",
                    success: false,
                    error: `Request failed: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ""}`,
                };
            }

            return await response.json();
        } catch (e) {
            return {
                original_part: part.manufacturer_part_number || "Unknown",
                analysis: "",
                success: false,
                error:
                    e instanceof Error
                        ? e.message
                        : "Failed to connect to backend",
            };
        }
    }
}

/*
    Query presets for Grok chat panel.
    These are the "Quick Questions" shown to users.
*/

import type { QueryPreset } from "./types";

export const QUERY_PRESETS: QueryPreset[] = [
    {
        id: "overview",
        title: "Overview",
        icon: "",
        description: "Get a summary of selected components",
        query: "Provide a detailed overview of the selected components, including their function, typical applications, and how they work together in this circuit.",
    },
    {
        id: "testing",
        title: "Testing",
        icon: "",
        description: "Testing and debugging tips",
        query: "How would I test these components to verify they are working correctly? Include typical voltage/current measurements, test equipment needed, and common failure modes.",
    },
    {
        id: "cost",
        title: "Cost",
        icon: "",
        description: "Pricing and alternatives",
        query: "What is the typical cost of these components? Suggest any cost-effective alternatives that could be used while maintaining similar functionality.",
    },
];

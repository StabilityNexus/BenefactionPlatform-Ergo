<script lang="ts">
    import { onMount } from "svelte";
    import EasyMDE from "easymde";
    import "easymde/dist/easymde.min.css";
    import { block_to_date, time_to_block } from "$lib/common/countdown";
    import { web_explorer_uri_tx } from "$lib/common/store";
    import { ErgoPlatform } from "$lib/ergo/platform";
    import { Label } from "$lib/components/ui/label/index.js";
    import { Button } from "$lib/components/ui/button";
    import { Input } from "$lib/components/ui/input";
    import * as Select from "$lib/components/ui/select";
    import * as Dialog from "$lib/components/ui/dialog";
    import { get } from "svelte/store";
    import { explorer_uri, user_tokens } from "$lib/common/store";
    import { walletConnected, walletAddress } from "wallet-svelte-component";
    import { ErgoAddress } from "@fleet-sdk/core";
    import { formatTransactionError } from "$lib/common/error-utils";
    import {
        validateProjectContent,
        getUsagePercentage,
        type ProjectContent,
    } from "$lib/ergo/utils/box-size-calculator";

    let platform = new ErgoPlatform();

    let rewardTokenOption: object | null = null;
    let rewardTokenId: string | null = null;
    let rewardTokenDecimals: number = 0;
    let rewardTokenName: string = "Token";

    let baseTokenOption: object | null = null;
    let baseTokenId: string = "";
    let baseTokenDecimals: number = 9;
    let baseTokenName: string = "ERG";
    let customBaseTokenId: string = "";
    let isCustomBaseToken: boolean = false;

    $: if (baseTokenOption === undefined) {
        baseTokenOption = null;
        baseTokenDecimals = 9;
        baseTokenName = "ERG";
    }

    let tokenAmountToSellRaw: number;
    let tokenAmountToSellPrecise: number;
    let maxTokenAmountToSell: number;

    let deadlineValue: number;
    let deadlineUnit: "days" | "minutes" = "days";
    let deadlineValueBlock: number | undefined;
    let deadlineMode: "timestamp" | "block" = "timestamp";
    let timestampInputMode: "duration" | "datetime" = "duration"; // New: how to input timestamp
    let deadlineDateTime: string = ""; // New: for datetime-local input
    let is_timestamp_limit: boolean = true; // Default to timestamp mode (R4._1 = true)
    let deadlineValueText: string;

    let ownerMode: "wallet" | "timelock" | "multisig" | "custom" | "custom_pk" = "wallet";
    let ownerBlockHeight: number | undefined;
    let ownerAddress: string = "";
    let ownerErgoTreeHex: string = "";
    // New input for custom address (Base58) mode
    let customOwnerAddressInput: string = "";
    let multisigAddresses: string[] = ["", ""];
    let multisigRequired: number = 2;
    let initializedOwnerAddress = false;

    $: if ($walletAddress && !initializedOwnerAddress) {
        ownerAddress = $walletAddress;
        initializedOwnerAddress = true;
    }

    // Reactive conversion: when in custom_pk mode, convert Base58 address to ErgoTree hex
    $: if (ownerMode === "custom_pk") {
        if (customOwnerAddressInput && customOwnerAddressInput.trim() !== "") {
            try {
                const parsed = ErgoAddress.fromBase58(customOwnerAddressInput.trim());
                ownerErgoTreeHex = parsed.ergoTree || "";
            } catch (e) {
                console.error("Invalid Ergo address provided:", e);
                ownerErgoTreeHex = "";
            }
        } else {
            ownerErgoTreeHex = "";
        }
    } else if (ownerMode === "wallet" && $walletAddress) {
        // Clear ergotree when using wallet mode
        ownerErgoTreeHex = "";
    }

    let exchangeRateRaw: number;
    let exchangeRatePrecise: number;

    let maxGoalPrecise: number;
    let minGoalPrecise: number;

    // Emergency-specific fields - Enhanced Verification Model
    let emergencyType: string = "";
    let communityType: string = "";
    let communityName: string = "";
    let emergencyDocuments: string[] = []; // Store document hashes
    let documentDescription: string = "";
    
    // Step 1: Identity & Location Anchoring
    let emergencyLocation: string = ""; // City/District
    let hospitalAuthorityName: string = ""; // Hospital/Authority name
    let jurisdictionConfirmed: boolean = false; // Community jurisdiction checkbox
    
    // Step 2: Document Trust Layer - Classified types
    let documentTypes: string[] = []; // Selected document types
    let availableDocumentTypes = [
        { value: "medical", label: "Medical Report / Hospital Bill" },
        { value: "fir", label: "FIR / Police Report" },
        { value: "ngo", label: "NGO or Authority Letter" },
        { value: "photo", label: "Geo-tagged Photo (Optional)" },
        { value: "community", label: "Community-issued Verification Letter" }
    ];
    
    // Step 3: Community Eligibility
    let minimumCommunityMembers: number = 20; // Minimum verified members
    let regionalVotingPercentage: number = 60; // Min % of voters from region
    
    // Step 4: Staged Fund Release
    let fundReleaseStages = [
        { stage: 1, percentage: 40, condition: "After community approval", released: false },
        { stage: 2, percentage: 30, condition: "Proof of hospital admission / expense update", released: false },
        { stage: 3, percentage: 30, condition: "Final report / discharge / authority confirmation", released: false }
    ];
    let currentStage: number = 1;

    let projectTitle: string = "";
    let projectDescription: string = "";
    let projectImage: string = "";
    let projectLink: string = "";

    let transactionId: string | null = null;
    let errorMessage: string | null = null;
    let isSubmitting: boolean = false;
    let statusMessage: string = "";

    let userTokens: Array<{
        tokenId: string;
        title: string;
        balance: number;
        decimals: number;
    }> = [];

    // Token creation modal state
    let showCreateTokenModal: boolean = false;
    let newTokenName: string = "";
    let newTokenSymbol: string = "";
    let newTokenSupply: number = 0;
    let newTokenDecimals: number = 0;
    let newTokenDescription: string = "";
    
    let availableRewardTokens: Array<{
        tokenId: string;
        title: string;
        balance: number;
        decimals: number;
    }> = [];
    let availableBaseTokens: Array<{
        tokenId: string;
        title: string;
        balance: number;
        decimals: number;
    }> = [];

    let formErrors: {
        tokenConflict: string | null;
        goalOrder: string | null;
        invalidBaseToken: string | null;
        invalidToken: string | null;
        exchangeRate: string | null;
        amountExceedsBalance: string | null;
    } = {
        tokenConflict: null,
        goalOrder: null,
        invalidBaseToken: null,
        invalidToken: null,
        exchangeRate: null,
        amountExceedsBalance: null,
    };

    let minViablePrice = 0;
    let exchangeRateWarning = "";

    let editorElement: HTMLTextAreaElement;
    let editor: EasyMDE;

    onMount(() => {
        if (editorElement) {
            editor = new EasyMDE({
                element: editorElement,
                initialValue: projectDescription,
                placeholder:
                    "Describe your project goals, roadmap, and vision...",
                status: false,
                spellChecker: false,
                toolbar: [
                    "bold",
                    "italic",
                    "heading",
                    "|",
                    "quote",
                    "unordered-list",
                    "ordered-list",
                    "|",
                    "link",
                    "preview",
                ],
            });

            editor.codemirror.on("change", () => {
                projectDescription = editor.value();
            });
        }
    });

    $: if (editor && editor.value() !== projectDescription) {
        editor.value(projectDescription);
    }

    $: {
        if (rewardTokenOption) {
            // Handle Create New Token trigger
            if (rewardTokenOption.value === "__create_new__") {
                showCreateTokenModal = true;
                rewardTokenOption = null; // Reset selection
                rewardTokenId = null;
            }
            // Handle template selections
            else if (rewardTokenOption.value === "__template_emergency__") {
                newTokenName = "Emergency Relief Token";
                newTokenSymbol = "ERT";
                newTokenSupply = 1000000;
                newTokenDecimals = 0;
                newTokenDescription = "General emergency relief funding token";
                showCreateTokenModal = true;
                rewardTokenOption = null;
                rewardTokenId = null;
            }
            else if (rewardTokenOption.value === "__template_medical__") {
                newTokenName = "Medical Aid Token";
                newTokenSymbol = "MAT";
                newTokenSupply = 500000;
                newTokenDecimals = 0;
                newTokenDescription = "Token for medical emergency campaigns";
                showCreateTokenModal = true;
                rewardTokenOption = null;
                rewardTokenId = null;
            }
            else if (rewardTokenOption.value === "__template_disaster__") {
                newTokenName = "Disaster Support Token";
                newTokenSymbol = "DST";
                newTokenSupply = 2000000;
                newTokenDecimals = 0;
                newTokenDescription = "Natural disaster relief support token";
                showCreateTokenModal = true;
                rewardTokenOption = null;
                rewardTokenId = null;
            }
            // Regular token selection
            else {
                rewardTokenId = rewardTokenOption.value;
            }
        } else {
            rewardTokenId = null;
        }
    }

    $: {
        if (rewardTokenId) {
            const token = userTokens.find((t) => t.tokenId === rewardTokenId);
            rewardTokenName = token ? token.title : "Token";
        } else {
            rewardTokenName = "Token";
        }
    }

    $: {
        if (baseTokenOption && baseTokenOption.value !== null) {
            if (baseTokenOption.value === "custom") {
                isCustomBaseToken = true;
                baseTokenId = customBaseTokenId;
            } else {
                isCustomBaseToken = false;
                baseTokenId = baseTokenOption.value;
                const baseToken = availableBaseTokens.find(
                    (t) => t.tokenId === baseTokenId,
                );
                baseTokenDecimals = baseToken?.decimals || 0;
                baseTokenName = baseToken?.title || "Unknown";
            }
        } else {
            isCustomBaseToken = false;
            baseTokenId = "";
            baseTokenDecimals = 9;
            baseTokenName = "ERG";
        }
    }

    $: if (isCustomBaseToken) {
        baseTokenId = customBaseTokenId;
    }

    // Sync deadlineMode with is_timestamp_limit
    $: is_timestamp_limit = deadlineMode === "timestamp";

    $: if (
        isCustomBaseToken &&
        customBaseTokenId &&
        customBaseTokenId.length >= 64
    ) {
        fetchTokenDetails(customBaseTokenId).then(({ name, decimals }) => {
            baseTokenName = name;
            baseTokenDecimals = decimals;
        });
    }

    $: {
        if (rewardTokenId && baseTokenId && rewardTokenId === baseTokenId) {
            formErrors.tokenConflict =
                "The Campaign Token and Contribution Currency cannot be the same.";
        } else {
            formErrors.tokenConflict = null;
        }
    }

    $: availableRewardTokens = userTokens;
    $: {
        const DEFAULT_CURRENCIES = [
            {
                tokenId:
                    "03faf2cb329f2e90d6d23b58d91bbb6c046aa143261cc21f52fbe2824bfcbf04",
                title: "SigUSD",
                decimals: 2,
                balance: 0,
            },
            {
                tokenId:
                    "886b7721bef42f60c6317d37d8752da8aca01898cae7dae61808c4a14225edc8",
                title: "GluonW GAU",
                decimals: 9,
                balance: 0,
            },
        ];

        /*
        // Create a map of user tokens for quick lookup
        const userTokenMap = new Map(userTokens.map((t) => [t.tokenId, t]));

        // Start with default currencies, using user's balance if they have it
        const combinedTokens = DEFAULT_CURRENCIES.map((def) => {
            const userToken = userTokenMap.get(def.tokenId);
            return userToken ? userToken : def;
        });

        // Add remaining user tokens that are not in defaults
        userTokens.forEach((t) => {
            if (!DEFAULT_CURRENCIES.find((d) => d.tokenId === t.tokenId)) {
                combinedTokens.push(t);
            }
        }); */

        availableBaseTokens = DEFAULT_CURRENCIES;
    }

    $: formErrors.invalidToken = null;

    $: rewardTokenDecimals =
        userTokens.find((t) => t.tokenId === rewardTokenId)?.decimals || 0;
    $: {
        const token = userTokens.find((t) => t.tokenId === rewardTokenId);
        maxTokenAmountToSell = token
            ? Number(token.balance) / Math.pow(10, token.decimals)
            : 0;
        tokenAmountToSellRaw =
            tokenAmountToSellPrecise * Math.pow(10, rewardTokenDecimals);

        // Only validate balance if wallet is connected AND token is selected
        if (rewardTokenId && tokenAmountToSellPrecise > maxTokenAmountToSell && maxTokenAmountToSell > 0) {
            formErrors.amountExceedsBalance =
                "Amount exceeds available balance.";
        } else {
            formErrors.amountExceedsBalance = null;
        }
    }

    $: {
        const exchangeRateNum =
            typeof exchangeRatePrecise === "string"
                ? parseFloat(exchangeRatePrecise)
                : exchangeRatePrecise;

        minViablePrice = Math.pow(10, rewardTokenDecimals - baseTokenDecimals);

        exchangeRateRaw =
            exchangeRateNum *
            Math.pow(10, baseTokenDecimals - rewardTokenDecimals);

        if (exchangeRateNum > 0 && exchangeRateRaw < 1) {
            formErrors.exchangeRate = `Price too low. Minimum viable price is ${minViablePrice.toFixed(Math.max(0, baseTokenDecimals))} ${baseTokenName} per ${rewardTokenName}`;
            exchangeRateWarning = `⚠️ Due to smart contract limitations, the minimum price for these tokens is ${minViablePrice.toFixed(Math.max(0, baseTokenDecimals))} ${baseTokenName} per ${rewardTokenName}`;
            exchangeRateRaw = 0;
        } else {
            formErrors.exchangeRate = null;
            exchangeRateWarning = "";
        }
    }

    $: {
        if (deadlineMode === "timestamp") {
            if (
                timestampInputMode === "duration" &&
                deadlineValue &&
                deadlineValue > 0
            ) {
                // Duration mode: calculate from days/minutes
                calculateBlockLimit(deadlineValue, deadlineUnit);
            } else if (timestampInputMode === "datetime" && deadlineDateTime) {
                // Datetime mode: use specific date/time
                calculateFromDateTime(deadlineDateTime);
            } else {
                deadlineValueBlock = undefined;
                deadlineValueText = "";
            }
        } else if (deadlineMode === "block") {
            // In block mode, deadlineValueBlock is set directly by the user
            // Just update the text representation
            if (deadlineValueBlock && deadlineValueBlock > 0) {
                block_to_date(deadlineValueBlock, platform)
                    .then((date) => {
                        deadlineValueText = date;
                    })
                    .catch(() => {
                        deadlineValueText = `Block ${deadlineValueBlock}`;
                    });
            } else {
                deadlineValueText = "";
            }
        } else {
            deadlineValueBlock = undefined;
            deadlineValueText = "";
        }
    }

    // Reactive validation for project content size (title, description, image, link)
    $: projectContentObject = {
        title: projectTitle,
        description: projectDescription,
        image: projectImage,
        link: projectLink,
    } as ProjectContent;

    let contentValidation = validateProjectContent({
        title: "",
        description: "",
        image: "",
        link: "",
    });
    let contentUsagePercentage = 0;
    let validationTimer: any;

    $: {
        if (validationTimer) clearTimeout(validationTimer);
        validationTimer = setTimeout(() => {
            contentValidation = validateProjectContent(projectContentObject);
            contentUsagePercentage = getUsagePercentage(projectContentObject);
        }, 1000);
    }

    $: contentBytesUsed = contentValidation.currentBytes;
    $: contentTooLarge = !contentValidation.isValid;
    $: estimatedBoxSize = contentValidation.estimatedBoxSize;

    function validateGoalOrder() {
        if (
            minGoalPrecise !== undefined &&
            maxGoalPrecise !== undefined &&
            minGoalPrecise > 0 &&
            maxGoalPrecise > 0 &&
            Number(minGoalPrecise) > Number(maxGoalPrecise)
        ) {
            formErrors.goalOrder =
                "The minimum goal cannot be greater than the maximum goal.";
        } else {
            formErrors.goalOrder = null;
        }
    }
    
    // Auto-validate whenever goals change
    $: if (minGoalPrecise !== undefined || maxGoalPrecise !== undefined) {
        validateGoalOrder();
    }

    async function calculateBlockLimit(
        value: number,
        unit: "days" | "minutes",
    ) {
        if (!platform || !value || value <= 0) {
            deadlineValueBlock = undefined;
            deadlineValueText = "";
            return;
        }
        try {
            let target_date = new Date();
            let milliseconds;
            if (unit === "days") {
                milliseconds = value * 24 * 60 * 60 * 1000;
            } else {
                milliseconds = value * 60 * 1000;
            }
            target_date.setTime(target_date.getTime() + milliseconds);

            if (deadlineMode === "timestamp") {
                // In timestamp mode, use the timestamp directly
                deadlineValueBlock = target_date.getTime();
                deadlineValueText =
                    target_date
                        .toISOString()
                        .replace("T", " ")
                        .substring(0, 16) + " UTC";
            } else {
                // In block mode, convert time to block height
                deadlineValueBlock = await time_to_block(
                    target_date.getTime(),
                    platform,
                );
                deadlineValueText = await block_to_date(
                    deadlineValueBlock,
                    platform,
                );
            }
        } catch (error) {
            console.error("Error calculating block limit:", error);
            deadlineValueBlock = undefined;
            deadlineValueText = "Error calculating deadline";
        }
    }

    async function calculateFromDateTime(datetimeString: string) {
        if (!platform || !datetimeString) {
            deadlineValueBlock = undefined;
            deadlineValueText = "";
            return;
        }
        try {
            // Parse the datetime-local input (format: YYYY-MM-DDTHH:MM)
            const target_date = new Date(datetimeString);

            // Check if the date is valid and in the future
            if (isNaN(target_date.getTime())) {
                deadlineValueBlock = undefined;
                deadlineValueText = "Invalid date";
                return;
            }

            if (target_date.getTime() <= Date.now()) {
                deadlineValueBlock = undefined;
                deadlineValueText = "Date must be in the future";
                return;
            }

            // In timestamp mode, use the timestamp directly
            deadlineValueBlock = target_date.getTime();
            deadlineValueText = target_date.toLocaleString();
        } catch (error) {
            console.error("Error calculating from datetime:", error);
            deadlineValueBlock = undefined;
            deadlineValueText = "Error calculating deadline";
        }
    }

    let isUpdating = false;

    function updateExchangeRate() {
        if (isUpdating) return;
        if (maxGoalPrecise && tokenAmountToSellPrecise && maxGoalPrecise > 0) {
            isUpdating = true;
            exchangeRatePrecise = maxGoalPrecise / tokenAmountToSellPrecise;
            isUpdating = false;
        }
        validateGoalOrder();
    }

    function updateMaxValue() {
        // Only auto-calculate if exchangeRate was manually set
        // Don't clear maxGoal when user is typing tokenAmount
        if (isUpdating) return;
        if (tokenAmountToSellPrecise && exchangeRatePrecise && exchangeRatePrecise > 0 && !maxGoalPrecise) {
            isUpdating = true;
            maxGoalPrecise = exchangeRatePrecise * tokenAmountToSellPrecise;
            isUpdating = false;
        }
        validateGoalOrder();
    }

    async function handleSubmit() {
        // Require wallet connection
        if (!$walletConnected) {
            errorMessage = "Please connect your wallet to create a campaign.";
            return;
        }

        if (
            rewardTokenId === null ||
            formErrors.tokenConflict ||
            formErrors.goalOrder ||
            formErrors.invalidToken ||
            formErrors.amountExceedsBalance
        ) {
            errorMessage = "Please correct the errors before submitting.";
            return;
        }

        isSubmitting = true;
        errorMessage = null;
        transactionId = null;

        if (minGoalPrecise === undefined) {
            minGoalPrecise = 0;
        }

        let minValueNano = minGoalPrecise * Math.pow(10, baseTokenDecimals);
        let minimumTokenSold =
            exchangeRateRaw > 0 ? minValueNano / exchangeRateRaw : 0;

        let projectContent = JSON.stringify({
            title: projectTitle,
            description: projectDescription,
            image: projectImage,
            link: projectLink,
            // Simplified emergency data to fit blockchain box size
            emergency: {
                type: emergencyType || "general",
                community: communityName || "General",
                phase: "pending_verification",
                votes: { approved: 0, rejected: 0, total: 0 }
            }
        });
        
        console.log("🔍 PROJECT CONTENT BEING SUBMITTED:", projectContent);
        console.log("🔍 Emergency data included:", JSON.parse(projectContent).emergency);

        try {
            let owner_ergotree = "";
            if (ownerMode === "timelock" && ownerBlockHeight && ownerAddress) {
                try {
                    owner_ergotree = ""; /*compile_refund_contract(
                        ownerAddress,
                        ownerBlockHeight,
                    );*/ 
                } catch (e: any) {
                    console.error("Error compiling timelock contract:", e);
                    errorMessage =
                        "Error compiling timelock contract: " +
                        (e.message || e);
                    isSubmitting = false;
                    return;
                }
            } else if ((ownerMode === "custom" || ownerMode === "custom_pk") && ownerErgoTreeHex) {
                owner_ergotree = ownerErgoTreeHex;
            } else if (ownerMode === "multisig") {
                const validAddresses = multisigAddresses.filter(
                    (a) => a.trim() !== "",
                );
                if (validAddresses.length < 2) {
                    errorMessage =
                        "At least 2 addresses are required for multisig.";
                    isSubmitting = false;
                    return;
                }
                if (multisigRequired > validAddresses.length) {
                    errorMessage =
                        "Required signatures cannot exceed number of addresses.";
                    isSubmitting = false;
                    return;
                }
                try {
                    owner_ergotree = ""; /*compile_multisig_contract(
                        validAddresses,
                        multisigRequired,
                    );*/
                } catch (e: any) {
                    console.error("Error compiling multisig contract:", e);
                    errorMessage =
                        "Error compiling multisig contract: " +
                        (e.message || e);
                    isSubmitting = false;
                    return;
                }
            }

            const submissionGen = platform.submit(
                platform.last_version,
                rewardTokenId,
                tokenAmountToSellRaw,
                deadlineValueBlock,
                is_timestamp_limit,
                Math.round(exchangeRateRaw),
                projectContent,
                Math.round(minimumTokenSold),
                projectTitle,
                baseTokenId,
                owner_ergotree,
            );

            let result = await submissionGen.next();
            while (!result.done) {
                statusMessage = result.value;
                result = await submissionGen.next();
            }
            transactionId = result.value;
        } catch (error) {
            console.error(error);
            errorMessage = formatTransactionError(error);
        } finally {
            isSubmitting = false;
            statusMessage = "";
        }
    }

    async function fetchTokenDetails(id: string) {
        const url = `${get(explorer_uri)}/api/v1/tokens/${id}`;
        try {
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                return {
                    name: data.name || id.slice(0, 6) + "..." + id.slice(-4),
                    decimals: data.decimals !== null ? data.decimals : 0,
                };
            }
        } catch (error) {
            console.error(`Error fetching token details for ${id}:`, error);
        }
        return { name: id.slice(0, 6) + "..." + id.slice(-4), decimals: 0 };
    }

    async function getUserTokens() {
        try {
            console.log("🔍 getUserTokens: Starting...");
            
            // Skip fetching if wallet has issues - user can still create new tokens
            try {
                let tokens: Map<string, number> = get(user_tokens);
                console.log("🔍 Current tokens in store:", tokens.size, "tokens");
                
                if (tokens.size === 0) {
                    console.log("🔍 Fetching balance from wallet...");
                    tokens = await platform.get_balance();
                    console.log("🔍 Got balance:", tokens);
                    user_tokens.set(tokens);
                }
                
                console.log("🔍 Processing tokens (excluding ERG)...");
                userTokens = await Promise.all(
                    Array.from(tokens.entries())
                        .filter(([tokenId, _]) => tokenId !== "ERG")
                        .map(async ([tokenId, balance]) => {
                            console.log(`🔍 Fetching details for token: ${tokenId}`);
                            const { name, decimals } =
                                await fetchTokenDetails(tokenId);
                            return {
                                tokenId,
                                title: name,
                                balance,
                                decimals,
                            };
                        }),
                );
                console.log("✅ userTokens loaded:", userTokens.length, "tokens", userTokens);
            } catch (balanceError) {
                console.warn("⚠️ Could not fetch wallet balance (this is OK if wallet is empty):", balanceError);
                userTokens = []; // Empty array - user can still create new tokens
            }
        } catch (error) {
            console.error("❌ Error fetching user tokens:", error);
            userTokens = []; // Fallback to empty
        }
    }

    walletConnected.subscribe((isConnected) => {
        console.log("👛 Wallet connection state changed:", isConnected);
        if (isConnected) {
            console.log("👛 Wallet connected - loading tokens...");
            getUserTokens();
        } else {
            console.log("👛 Wallet disconnected - clearing tokens");
            userTokens = [];
            rewardTokenOption = null;
            baseTokenOption = null;
        }
    });
</script>

<div>
    <div class="container mx-auto py-8 px-4 max-w-4xl">
        <div class="text-center mb-10">
            <h2 class="project-title">Submit Emergency Fund Request</h2>
            <p class="text-muted-foreground mt-2">
                Complete the form below. Your request will undergo community verification before donations are enabled.
            </p>
            <div class="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span class="px-3 py-1 bg-yellow-500/10 border border-yellow-500/20 rounded-full">Phase 1: Creation</span>
                <span>→</span>
                <span class="px-3 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full">Phase 2: Verification</span>
                <span>→</span>
                <span class="px-3 py-1 bg-green-500/10 border border-green-500/20 rounded-full">Phase 3: Donations</span>
                <span>→</span>
                <span class="px-3 py-1 bg-purple-500/10 border border-purple-500/20 rounded-full">Phase 4: Withdrawal</span>
            </div>
        </div>

        <div class="flex items-center justify-center mb-12 relative">
            <div
                class="absolute h-1 bg-orange-900/30 w-[calc(66%+2.5rem)] top-4 -translate-y-1/2 z-0 rounded-full"
            ></div>
            <div class="flex justify-between w-2/3 relative z-10">
                <div class="flex flex-col items-center gap-2">
                    <div
                        class="w-8 h-8 md:w-10 md:h-10 rounded-full bg-orange-500 text-black font-bold flex items-center justify-center shadow-[0_0_15px_rgba(249,115,22,0.5)] z-10 ring-4 ring-background"
                    >
                        1
                    </div>
                    <span
                        class="text-xs font-medium text-orange-400 uppercase tracking-wider bg-background px-2 rounded"
                        >Tokens</span
                    >
                </div>
                <div class="flex flex-col items-center gap-2">
                    <div
                        class="w-8 h-8 md:w-10 md:h-10 rounded-full {baseTokenOption ||
                        maxGoalPrecise
                            ? 'bg-orange-500 text-black'
                            : 'bg-zinc-900 text-orange-500/50 border border-orange-500/20'} font-bold flex items-center justify-center transition-colors duration-300 z-10 ring-4 ring-background"
                    >
                        2
                    </div>
                    <span
                        class="text-xs font-medium {baseTokenOption ||
                        maxGoalPrecise
                            ? 'text-orange-400'
                            : 'text-muted-foreground'} uppercase tracking-wider bg-background px-2 rounded"
                        >Terms</span
                    >
                </div>
                <div class="flex flex-col items-center gap-2">
                    <div
                        class="w-8 h-8 md:w-10 md:h-10 rounded-full {projectTitle
                            ? 'bg-orange-500 text-black'
                            : 'bg-zinc-900 text-orange-500/50 border border-orange-500/20'} font-bold flex items-center justify-center transition-colors duration-300 z-10 ring-4 ring-background"
                    >
                        3
                    </div>
                    <span
                        class="text-xs font-medium {projectTitle
                            ? 'text-orange-400'
                            : 'text-muted-foreground'} uppercase tracking-wider bg-background px-2 rounded"
                        >Details</span
                    >
                </div>
            </div>
        </div>

        <div class="space-y-8">
            <!-- Emergency Type Selection -->
            <div
                class="step-card bg-card/50 backdrop-blur-sm border border-red-500/20 rounded-xl p-6 md:p-8 shadow-lg relative overflow-hidden group"
            >
                <div
                    class="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-red-500 to-transparent opacity-50"
                ></div>
                <h3
                    class="text-xl font-semibold mb-6 text-red-400 flex items-center gap-2"
                >
                    <span class="opacity-50">🚨</span> Emergency Information
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="form-group">
                        <Label
                            for="emergencyType"
                            class="text-sm font-medium mb-2 block text-foreground/90"
                            >Emergency Type *</Label
                        >
                        <Select.Root bind:selected={emergencyType} required>
                            <Select.Trigger
                                class="w-full bg-background/50 border-red-500/20 hover:border-red-500/40 transition-colors"
                            >
                                <Select.Value
                                    placeholder="Select emergency type"
                                />
                            </Select.Trigger>
                            <Select.Content
                                class="border-red-500/20 bg-background/95 backdrop-blur-xl"
                            >
                                <Select.Item
                                    value="medical"
                                    class="hover:bg-red-500/10 cursor-pointer"
                                >
                                    🏥 Medical Emergency
                                </Select.Item>
                                <Select.Item
                                    value="accident"
                                    class="hover:bg-red-500/10 cursor-pointer"
                                >
                                    🚑 Accident
                                </Select.Item>
                                <Select.Item
                                    value="natural_disaster"
                                    class="hover:bg-red-500/10 cursor-pointer"
                                >
                                    🌪️ Natural Disaster
                                </Select.Item>
                                <Select.Item
                                    value="financial_crisis"
                                    class="hover:bg-red-500/10 cursor-pointer"
                                >
                                    💸 Sudden Financial Crisis
                                </Select.Item>
                            </Select.Content>
                        </Select.Root>
                    </div>

                    <div class="form-group">
                        <Label
                            for="communityType"
                            class="text-sm font-medium mb-2 block text-foreground/90"
                            >Community Type *</Label
                        >
                        <Select.Root bind:selected={communityType} required>
                            <Select.Trigger
                                class="w-full bg-background/50 border-red-500/20 hover:border-red-500/40 transition-colors"
                            >
                                <Select.Value
                                    placeholder="Select community"
                                />
                            </Select.Trigger>
                            <Select.Content
                                class="border-red-500/20 bg-background/95 backdrop-blur-xl"
                            >
                                <Select.Item
                                    value="college"
                                    class="hover:bg-red-500/10 cursor-pointer"
                                >
                                    🎓 College/University
                                </Select.Item>
                                <Select.Item
                                    value="district"
                                    class="hover:bg-red-500/10 cursor-pointer"
                                >
                                    🏘️ District/Local Area
                                </Select.Item>
                                <Select.Item
                                    value="organization"
                                    class="hover:bg-red-500/10 cursor-pointer"
                                >
                                    🏢 Organization/DAO
                                </Select.Item>
                                <Select.Item
                                    value="regional"
                                    class="hover:bg-red-500/10 cursor-pointer"
                                >
                                    🌍 Regional/State
                                </Select.Item>
                            </Select.Content>
                        </Select.Root>
                    </div>
                </div>

                <div class="form-group mt-6">
                    <Label
                        for="communityName"
                        class="text-sm font-medium mb-2 block text-foreground/90"
                        >Community Name *</Label
                    >
                    <Input
                        id="communityName"
                        bind:value={communityName}
                        placeholder="e.g., Stanford University, Mumbai District, XYZ DAO"
                        class="bg-background/50 border-red-500/20 hover:border-red-500/40 transition-colors"
                        required
                    />
                    <p class="text-xs mt-2 text-muted-foreground">
                        Specify the community that will verify this emergency
                    </p>
                </div>

                <!-- Step 1: Identity & Location Anchoring (ENHANCED) -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                    <div class="form-group">
                        <Label
                            for="emergencyLocation"
                            class="text-sm font-medium mb-2 block text-foreground/90"
                            >📍 Emergency Location (City/District) *</Label
                        >
                        <Input
                            id="emergencyLocation"
                            bind:value={emergencyLocation}
                            placeholder="e.g., Mumbai, Bangalore District"
                            class="bg-background/50 border-red-500/20 hover:border-red-500/40 transition-colors"
                            required
                        />
                        <p class="text-xs mt-2 text-muted-foreground">
                            Approximate location (not exact GPS for privacy)
                        </p>
                    </div>

                    <div class="form-group">
                        <Label
                            for="hospitalAuthorityName"
                            class="text-sm font-medium mb-2 block text-foreground/90"
                            >🏥 Hospital / Authority Name *</Label
                        >
                        <Input
                            id="hospitalAuthorityName"
                            bind:value={hospitalAuthorityName}
                            placeholder="e.g., Apollo Hospital, Police Station XYZ"
                            class="bg-background/50 border-red-500/20 hover:border-red-500/40 transition-colors"
                            required
                        />
                        <p class="text-xs mt-2 text-muted-foreground">
                            Hospital, police station, relief center, etc.
                        </p>
                    </div>
                </div>

                <div class="form-group mt-6">
                    <div class="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                        <input
                            type="checkbox"
                            id="jurisdictionConfirmed"
                            bind:checked={jurisdictionConfirmed}
                            class="mt-1 w-4 h-4 accent-blue-500"
                            required
                        />
                        <label for="jurisdictionConfirmed" class="text-sm text-foreground/90 cursor-pointer">
                            <strong>🗺️ Community Jurisdiction Confirmation *</strong>
                            <p class="text-xs mt-1 text-muted-foreground">
                                I confirm that this emergency falls under the selected community's region and the community members are geographically or institutionally qualified to verify this case.
                            </p>
                        </label>
                    </div>
                </div>

                <!-- Step 2: Document Trust Layer - Classified Types (ENHANCED) -->
                <div class="form-group mt-6">
                    <Label class="text-sm font-medium mb-3 block text-foreground/90">
                        📄 Document Types * (Select all that apply)
                    </Label>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {#each availableDocumentTypes as docType}
                            <label class="flex items-start gap-3 p-3 bg-background/50 border border-red-500/20 rounded-lg hover:border-red-500/40 transition-colors cursor-pointer">
                                <input
                                    type="checkbox"
                                    value={docType.value}
                                    bind:group={documentTypes}
                                    class="mt-0.5 w-4 h-4 accent-red-500"
                                />
                                <span class="text-sm text-foreground/90">{docType.label}</span>
                            </label>
                        {/each}
                    </div>
                    <p class="text-xs mt-2 text-muted-foreground">
                        Classify your supporting documents for structured verification
                    </p>
                </div>

                <div class="form-group mt-6">
                    <Label
                        for="documentDescription"
                        class="text-sm font-medium mb-2 block text-foreground/90"
                        >Supporting Documents Description *</Label
                    >
                    <textarea
                        id="documentDescription"
                        bind:value={documentDescription}
                        placeholder="Describe the documents you're providing (e.g., Hospital bill from Apollo Hospital, Police FIR report, Medical prescription, Photos of incident)"
                        class="w-full min-h-[100px] bg-background/50 border border-red-500/20 hover:border-red-500/40 transition-colors rounded-md px-3 py-2 text-sm"
                        required
                    ></textarea>
                    <p class="text-xs mt-2 text-muted-foreground">
                        List all documents that prove the emergency. Community verifiers will review these.
                    </p>
                </div>

                <div class="form-group mt-6">
                    <Label
                        class="text-sm font-medium mb-2 block text-foreground/90"
                        >Document Proofs (Hashes or Links)</Label
                    >
                    <div class="space-y-3">
                        {#each emergencyDocuments as doc, index}
                            <div class="flex gap-2 items-center">
                                <Input
                                    value={doc}
                                    readonly
                                    class="bg-background/50 border-red-500/20 text-xs {(doc.startsWith('Qm') || doc.length === 64) ? 'font-mono' : ''}"
                                    placeholder="Hash or link will appear here"
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    class="text-red-400 hover:text-red-300"
                                    on:click={() => {
                                        emergencyDocuments = emergencyDocuments.filter((_, i) => i !== index);
                                    }}
                                >
                                    ✕
                                </Button>
                            </div>
                        {/each}
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                class="border-red-500/20 hover:border-red-500/40 hover:bg-red-500/10"
                                on:click={() => {
                                    const hash = prompt('Paste document hash (IPFS CID or SHA-256):');
                                    if (hash && hash.trim()) {
                                        emergencyDocuments = [...emergencyDocuments, hash.trim()];
                                    }
                                }}
                            >
                                📦 Add Hash (IPFS/SHA256)
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                class="border-blue-500/20 hover:border-blue-500/40 hover:bg-blue-500/10"
                                on:click={() => {
                                    const link = prompt('Paste Google Drive/Cloud link (make sure it\'s publicly viewable):');
                                    if (link && link.trim()) {
                                        emergencyDocuments = [...emergencyDocuments, link.trim()];
                                    }
                                }}
                            >
                                🔗 Add Drive Link
                            </Button>
                        </div>
                    </div>
                    <p class="text-xs mt-2 text-muted-foreground">
                        <strong>Option 1:</strong> Upload to IPFS/Storage and add cryptographic hash (most secure) <br/>
                        <strong>Option 2:</strong> Share Google Drive/Dropbox link (easier for demo, ensure public access)
                    </p>
                    <div class="bg-blue-500/10 border border-blue-500/20 rounded p-3 mt-3">
                        <p class="text-xs text-blue-200">
                            💡 <strong>Tip:</strong> For Google Drive: Right-click file → Get link → "Anyone with the link can view"
                        </p>
                    </div>
                </div>

                <!-- Step 3: Community Eligibility Rules (ENHANCED) -->
                <div class="bg-purple-500/10 border border-purple-500/20 rounded-lg p-6 mt-6">
                    <h4 class="text-sm font-semibold text-purple-300 mb-4 flex items-center gap-2">
                        <span>🛡️</span> Community Eligibility & Anti-Corruption Rules
                    </h4>
                    <div class="space-y-3 text-sm text-foreground/80">
                        <div class="flex items-start gap-2">
                            <span class="text-green-400 mt-0.5">✔</span>
                            <span>Community must be within same district OR institutionally linked</span>
                        </div>
                        <div class="flex items-start gap-2">
                            <span class="text-green-400 mt-0.5">✔</span>
                            <span>Minimum {minimumCommunityMembers} verified members required</span>
                        </div>
                        <div class="flex items-start gap-2">
                            <span class="text-green-400 mt-0.5">✔</span>
                            <span>At least {regionalVotingPercentage}% voters must belong to the region</span>
                        </div>
                        <div class="flex items-start gap-2">
                            <span class="text-green-400 mt-0.5">✔</span>
                            <span>All votes and documents are publicly auditable on-chain</span>
                        </div>
                    </div>
                    <p class="text-xs mt-4 text-purple-200/60 italic">
                        Even if a community tries to collude, the protocol restricts voting power to geographically or institutionally relevant members.
                    </p>
                </div>

                <!-- Step 4: Staged Fund Release (ENHANCED) -->
                <div class="bg-green-500/10 border border-green-500/20 rounded-lg p-6 mt-6">
                    <h4 class="text-sm font-semibold text-green-300 mb-4 flex items-center gap-2">
                        <span>💰</span> Staged Fund Release (Escrow Protection)
                    </h4>
                    <div class="space-y-4">
                        {#each fundReleaseStages as stage}
                            <div class="flex items-start gap-3 p-3 bg-background/30 rounded-lg">
                                <div class="flex-shrink-0 w-12 h-12 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center font-bold text-green-300">
                                    {stage.percentage}%
                                </div>
                                <div class="flex-1">
                                    <p class="text-sm font-medium text-foreground/90">Stage {stage.stage}</p>
                                    <p class="text-xs text-muted-foreground mt-1">{stage.condition}</p>
                                </div>
                            </div>
                        {/each}
                    </div>
                    <div class="bg-red-100 border-2 border-red-600 rounded p-4 mt-4">
                        <p class="text-base text-red-900 font-bold">
                            <strong class="text-red-950">⚠️ Auto-Freeze Protection:</strong> If verification fails at any stage, remaining funds are automatically frozen and can be refunded to donors.
                        </p>
                    </div>
                </div>

                <div class="bg-yellow-100 border-2 border-yellow-600 rounded-lg p-4 mt-6">
                    <p class="text-lg text-yellow-950 font-bold mb-3">⚠️ Phase 2: Community Verification Required</p>
                    <p class="text-base text-yellow-900 font-semibold">
                        After submission, your emergency will enter the verification phase. Community members will review your case and vote. You need ≥60% approval to proceed to the donation phase.
                    </p>
                </div>
            </div>

            <div
                class="step-card bg-card/50 backdrop-blur-sm border border-orange-500/10 rounded-xl p-6 md:p-8 shadow-lg relative overflow-hidden group"
            >
                <div
                    class="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-500 to-transparent opacity-50"
                ></div>
                <h3
                    class="text-xl font-semibold mb-6 text-orange-400 flex items-center gap-2"
                >
                    <span class="opacity-50">01.</span> Token Configuration
                </h3>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="form-group">
                        <Label
                            for="rewardToken"
                            class="text-sm font-medium mb-2 block text-foreground/90"
                            >Reward Token (PFT) *</Label
                        >
                        <Select.Root bind:selected={rewardTokenOption} required>
                            <Select.Trigger
                                class="w-full bg-background/50 border-orange-500/20 hover:border-orange-500/40 transition-colors"
                            >
                                <Select.Value
                                    placeholder="Select your reward token"
                                />
                            </Select.Trigger>
                            <Select.Content
                                class="max-h-[300px] overflow-y-auto border-orange-500/20 bg-background/95 backdrop-blur-xl"
                            >
                                <!-- Create New Token Option (ALWAYS FIRST) -->
                                <Select.Item
                                    value="__create_new__"
                                    class="hover:bg-green-500/10 cursor-pointer border-b border-muted"
                                >
                                    <div class="flex items-center gap-2">
                                        <span class="text-green-400 font-bold">+</span>
                                        <div class="flex flex-col">
                                            <span class="font-medium text-green-400">Create New Token</span>
                                            <span class="text-xs text-muted-foreground">Mint a new emergency relief token</span>
                                        </div>
                                    </div>
                                </Select.Item>

                                <!-- Emergency Token Templates -->
                                <Select.Group>
                                    <Select.Label class="text-xs text-muted-foreground px-2 py-1">
                                        📋 Quick Templates (Auto-fill)
                                    </Select.Label>
                                    <Select.Item
                                        value="__template_emergency__"
                                        class="hover:bg-orange-500/10 cursor-pointer"
                                    >
                                        <div class="flex flex-col">
                                            <span class="font-medium">🚨 Emergency Relief Token</span>
                                            <span class="text-xs text-muted-foreground">General emergency fund token</span>
                                        </div>
                                    </Select.Item>
                                    <Select.Item
                                        value="__template_medical__"
                                        class="hover:bg-orange-500/10 cursor-pointer"
                                    >
                                        <div class="flex flex-col">
                                            <span class="font-medium">🏥 Medical Aid Token</span>
                                            <span class="text-xs text-muted-foreground">For medical emergency campaigns</span>
                                        </div>
                                    </Select.Item>
                                    <Select.Item
                                        value="__template_disaster__"
                                        class="hover:bg-orange-500/10 cursor-pointer"
                                    >
                                        <div class="flex flex-col">
                                            <span class="font-medium">🌪️ Disaster Support Token</span>
                                            <span class="text-xs text-muted-foreground">Natural disaster relief token</span>
                                        </div>
                                    </Select.Item>
                                </Select.Group>

                                <!-- User's Existing Tokens (Creator-owned only) -->
                                {#if availableRewardTokens.length > 0}
                                    <Select.Group>
                                        <Select.Label class="text-xs text-muted-foreground px-2 py-1 border-t border-muted mt-1">
                                            🪙 Your Existing Tokens
                                        </Select.Label>
                                        {#each availableRewardTokens as token}
                                            <Select.Item
                                                value={token.tokenId}
                                                class="hover:bg-orange-500/10 cursor-pointer"
                                            >
                                                <div class="flex flex-col">
                                                    <span class="font-medium">{token.title}</span>
                                                    <span class="text-xs text-muted-foreground">
                                                        Balance: {Number(token.balance) / Math.pow(10, token.decimals)} | ID: {token.tokenId.substring(0, 8)}...
                                                    </span>
                                                </div>
                                            </Select.Item>
                                        {/each}
                                    </Select.Group>
                                {/if}
                            </Select.Content>
                        </Select.Root>
                        <p class="text-xs mt-2 text-muted-foreground">
                            <strong>💡 Tip:</strong> Choose an existing token you own, use a template for quick setup, or create a new one. Only fungible tokens (not NFTs) are shown.
                        </p>
                    </div>

                    <div class="form-group">
                        <Label
                            for="tokenAmountToSell"
                            class="text-sm font-medium mb-2 block text-foreground/90"
                            >Amount for Sale</Label
                        >
                        <div class="relative">
                            <Input
                                type="number"
                                id="tokenAmountToSell"
                                bind:value={tokenAmountToSellPrecise}
                                max={maxTokenAmountToSell}
                                step={1 / Math.pow(10, rewardTokenDecimals)}
                                min={0}
                                placeholder="0.00"
                                on:input={updateMaxValue}
                                class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50 pr-20 {formErrors.amountExceedsBalance
                                    ? 'border-red-500 focus:ring-red-500/20'
                                    : ''}"
                            />
                            <span
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-orange-500/70 pointer-events-none truncate max-w-[70px] text-right"
                            >
                                {rewardTokenName}
                            </span>
                        </div>
                        {#if formErrors.amountExceedsBalance}
                            <p class="text-xs text-red-400 mt-1">
                                {formErrors.amountExceedsBalance}
                            </p>
                        {/if}
                    </div>
                </div>
            </div>

            <div
                class="step-card bg-card/50 backdrop-blur-sm border border-orange-500/10 rounded-xl p-6 md:p-8 shadow-lg relative overflow-hidden"
            >
                <div
                    class="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-500 to-transparent opacity-50"
                ></div>
                <h3
                    class="text-xl font-semibold mb-6 text-orange-400 flex items-center gap-2"
                >
                    <span class="opacity-50">02.</span> Financial Terms
                </h3>

                {#if formErrors.tokenConflict || formErrors.invalidToken}
                    <div
                        class="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
                    >
                        <p class="text-red-400 text-sm text-center font-medium">
                            {formErrors.tokenConflict ||
                                formErrors.invalidToken}
                        </p>
                    </div>
                {/if}

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="form-group md:col-span-2">
                        <Label
                            for="baseToken"
                            class="text-sm font-medium mb-2 block text-foreground/90"
                            >Contribution Currency</Label
                        >
                        <Select.Root bind:selected={baseTokenOption}>
                            <Select.Trigger
                                class="w-full bg-background/50 border-orange-500/20 hover:border-orange-500/40 transition-colors"
                            >
                                <Select.Value placeholder="Select currency" />
                            </Select.Trigger>
                            <Select.Content
                                class="max-h-[300px] overflow-y-auto border-orange-500/20 bg-background/95 backdrop-blur-xl"
                            >
                                <Select.Item
                                    value={null}
                                    class="hover:bg-orange-500/10 cursor-pointer font-medium"
                                    >ERG (Ergo)</Select.Item
                                >
                                {#each availableBaseTokens as token}
                                    <Select.Item
                                        value={token.tokenId}
                                        class="hover:bg-orange-500/10 cursor-pointer"
                                        >{token.title}</Select.Item
                                    >
                                {/each}
                                <Select.Item
                                    value="custom"
                                    class="hover:bg-orange-500/10 cursor-pointer font-medium text-orange-400 border-t border-orange-500/10 mt-1 pt-1"
                                    >Other Token ID...</Select.Item
                                >
                            </Select.Content>
                        </Select.Root>

                        {#if isCustomBaseToken}
                            <div class="mt-3">
                                <Label
                                    for="customTokenId"
                                    class="text-xs font-medium mb-1.5 block text-foreground/80"
                                >
                                    Token ID
                                </Label>
                                <Input
                                    id="customTokenId"
                                    bind:value={customBaseTokenId}
                                    placeholder="Enter the token ID"
                                    class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50 text-xs font-mono"
                                />
                                {#if customBaseTokenId && baseTokenName !== "ERG" && baseTokenName !== "Unknown" && baseTokenName !== customBaseTokenId.slice(0, 6) + "..." + customBaseTokenId.slice(-4)}
                                    <p class="text-xs text-green-400 mt-1">
                                        Found: {baseTokenName} (Decimals: {baseTokenDecimals})
                                    </p>
                                {/if}
                            </div>
                        {/if}
                    </div>

                    <div class="form-group">
                        <Label
                            for="exchangeRate"
                            class="text-sm font-medium mb-2 block text-foreground/90"
                            >Token Price</Label
                        >
                        <div class="relative">
                            <Input
                                type="number"
                                id="exchangeRate"
                                bind:value={exchangeRatePrecise}
                                min={0}
                                step="0.000000001"
                                placeholder="0.00"
                                on:blur={updateMaxValue}
                                class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50 pr-32 {formErrors.exchangeRate
                                    ? 'border-red-500 focus:ring-red-500/20'
                                    : ''}"
                            />
                            <span
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-orange-500/70 pointer-events-none"
                            >
                                {baseTokenName} / 1 Token
                            </span>
                        </div>
                        {#if exchangeRateWarning}
                            <p
                                class="text-xs text-yellow-500 mt-2 bg-yellow-500/10 p-2 rounded"
                            >
                                {exchangeRateWarning}
                            </p>
                        {/if}
                    </div>

                    <div
                        class="grid grid-cols-1 md:grid-cols-2 gap-6 md:col-span-2"
                    >
                        <div class="form-group">
                            <Label
                                for="deadlineMode"
                                class="text-sm font-medium mb-2 block text-foreground/90"
                                >Deadline Mode</Label
                            >
                            <div class="relative">
                                <select
                                    id="deadlineMode"
                                    bind:value={deadlineMode}
                                    class="w-full h-10 px-3 py-2 bg-background/50 border border-orange-500/20 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 appearance-none"
                                >
                                    <option value="timestamp"
                                        >Timestamp (Precise time-based)</option
                                    >
                                    <option value="block"
                                        >Block Height (Block-based)</option
                                    >
                                </select>
                                <div
                                    class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-orange-500/70"
                                >
                                    <svg
                                        width="10"
                                        height="6"
                                        viewBox="0 0 10 6"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                        ><path
                                            d="M1 1L5 5L9 1"
                                            stroke="currentColor"
                                            stroke-width="1.5"
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                        /></svg
                                    >
                                </div>
                            </div>
                            <p class="text-xs mt-2 text-muted-foreground">
                                {#if deadlineMode === "timestamp"}
                                    Timestamp mode uses precise time-based
                                    deadlines (recommended for most campaigns).
                                {:else}
                                    Block height mode uses blockchain block
                                    numbers for deadlines.
                                {/if}
                            </p>
                        </div>

                        <div class="form-group">
                            <Label
                                for="deadlineValue"
                                class="text-sm font-medium mb-2 block text-foreground/90"
                                >{deadlineMode === "timestamp"
                                    ? "Deadline"
                                    : "Block Height"}</Label
                            >
                            {#if deadlineMode === "timestamp"}
                                <!-- Timestamp mode: choose between duration or specific datetime -->
                                <div class="mb-3">
                                    <div class="flex gap-2 mb-2">
                                        <button
                                            type="button"
                                            on:click={() =>
                                                (timestampInputMode =
                                                    "duration")}
                                            class="flex-1 px-3 py-2 text-sm rounded-md transition-colors {timestampInputMode ===
                                            'duration'
                                                ? 'bg-orange-500 text-black font-medium'
                                                : 'bg-background/50 border border-orange-500/20 hover:border-orange-500/40'}"
                                        >
                                            📅 Duration
                                        </button>
                                        <button
                                            type="button"
                                            on:click={() =>
                                                (timestampInputMode =
                                                    "datetime")}
                                            class="flex-1 px-3 py-2 text-sm rounded-md transition-colors {timestampInputMode ===
                                            'datetime'
                                                ? 'bg-orange-500 text-black font-medium'
                                                : 'bg-background/50 border border-orange-500/20 hover:border-orange-500/40'}"
                                        >
                                            🕐 Specific Date/Time
                                        </button>
                                    </div>
                                </div>

                                {#if timestampInputMode === "duration"}
                                    <!-- Duration input (existing) -->
                                    <div class="flex space-x-2">
                                        <Input
                                            id="deadlineValue"
                                            type="number"
                                            bind:value={deadlineValue}
                                            min="1"
                                            placeholder="30"
                                            class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50"
                                        />
                                        <div class="relative min-w-[110px]">
                                            <select
                                                bind:value={deadlineUnit}
                                                class="w-full h-10 px-3 py-2 bg-background/50 border border-orange-500/20 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 appearance-none"
                                            >
                                                <option value="days"
                                                    >Days</option
                                                >
                                                <option value="minutes"
                                                    >Minutes</option
                                                >
                                            </select>
                                            <div
                                                class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-orange-500/70"
                                            >
                                                <svg
                                                    width="10"
                                                    height="6"
                                                    viewBox="0 0 10 6"
                                                    fill="none"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    ><path
                                                        d="M1 1L5 5L9 1"
                                                        stroke="currentColor"
                                                        stroke-width="1.5"
                                                        stroke-linecap="round"
                                                        stroke-linejoin="round"
                                                    /></svg
                                                >
                                            </div>
                                        </div>
                                    </div>
                                    <p
                                        class="text-xs mt-2 text-muted-foreground"
                                    >
                                        Specify how long from now the deadline
                                        will be
                                    </p>
                                {:else}
                                    <!-- Datetime input (new) -->
                                    <Input
                                        id="deadlineDateTime"
                                        type="datetime-local"
                                        bind:value={deadlineDateTime}
                                        class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50"
                                    />
                                    <p
                                        class="text-xs mt-2 text-muted-foreground"
                                    >
                                        Select a specific date and time for the
                                        deadline
                                    </p>
                                {/if}
                            {:else}
                                <!-- Block mode (existing) -->
                                <Input
                                    id="deadlineValue"
                                    type="number"
                                    bind:value={deadlineValueBlock}
                                    min="1"
                                    placeholder="Enter block height"
                                    class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50"
                                />
                                <p class="text-xs mt-2 text-muted-foreground">
                                    Enter the target block height directly
                                </p>
                            {/if}
                            {#if deadlineValueText}
                                <p class="text-xs mt-1 text-orange-400">
                                    Deadline: {deadlineValueText}
                                </p>
                            {/if}
                        </div>
                    </div>

                    <div class="form-group">
                        <Label
                            for="minGoal"
                            class="text-sm font-medium mb-2 block text-foreground/90"
                            >Minimum Goal</Label
                        >
                        <div class="relative">
                            <Input
                                type="number"
                                id="minGoal"
                                bind:value={minGoalPrecise}
                                max={maxGoalPrecise}
                                min={0}
                                placeholder="0.00"
                                on:blur={validateGoalOrder}
                                class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50 pr-20 {formErrors.goalOrder
                                    ? 'border-red-500'
                                    : ''}"
                            />
                            <span
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-orange-500/70 pointer-events-none"
                            >
                                {baseTokenName}
                            </span>
                        </div>
                    </div>

                    <div class="form-group">
                        <Label
                            for="maxGoal"
                            class="text-sm font-medium mb-2 block text-foreground/90"
                            >Maximum Goal</Label
                        >
                        <div class="relative">
                            <Input
                                type="number"
                                id="maxGoal"
                                bind:value={maxGoalPrecise}
                                min={minGoalPrecise || 0}
                                placeholder="0.00"
                                on:blur={updateExchangeRate}
                                class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50 pr-20"
                            />
                            <span
                                class="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-orange-500/70 pointer-events-none"
                            >
                                {baseTokenName}
                            </span>
                        </div>
                    </div>

                    {#if formErrors.goalOrder}
                        <p
                            class="text-red-400 text-sm md:col-span-2 text-center font-medium"
                        >
                            {formErrors.goalOrder}
                        </p>
                    {/if}

                    <div
                        class="form-group md:col-span-2 border-t border-orange-500/10 pt-6 mt-2"
                    >
                        <div class="flex flex-row items-baseline gap-4 mb-4">
                            <Label
                                class="text-lg font-semibold block text-orange-400"
                                >Owner Configuration</Label
                            >
                            <p class="text-xs text-muted-foreground">
                                The owner is the one who receives the funds and has the ability to add or withdraw contribution tokens.
                            </p>
                        </div>
                        <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
                            <button
                                type="button"
                                on:click={() => (ownerMode = "wallet")}
                                class="px-3 py-2 text-xs md:text-sm rounded-md transition-colors {ownerMode ===
                                'wallet'
                                    ? 'bg-orange-500 text-black font-medium'
                                    : 'bg-background/50 border border-orange-500/20 hover:border-orange-500/40'}"
                            >
                                Your Wallet
                            </button>
                            <button
                                disabled
                                type="button"
                                on:click={() => (ownerMode = "custom_pk")}
                                class="px-3 py-2 text-xs md:text-sm rounded-md transition-colors {ownerMode === 'custom_pk'
                                    ? 'bg-orange-500 text-black font-medium'
                                    : 'bg-background/50 border border-orange-500/20 hover:border-orange-500/40'}"
                            >
                                Address
                            </button>
                            <button
                                disabled
                                type="button"
                                on:click={() => (ownerMode = "timelock")}
                                class="px-3 py-2 text-xs md:text-sm rounded-md transition-colors {ownerMode ===
                                'timelock'
                                    ? 'bg-orange-500 text-black font-medium'
                                    : 'bg-background/50 border border-orange-500/20 hover:border-orange-500/40'}"
                            >
                                Time-locked
                            </button>
                            <button
                                disabled
                                type="button"
                                on:click={() => (ownerMode = "multisig")}
                                class="px-3 py-2 text-xs md:text-sm rounded-md transition-colors {ownerMode ===
                                'multisig'
                                    ? 'bg-orange-500 text-black font-medium'
                                    : 'bg-background/50 border border-orange-500/20 hover:border-orange-500/40'}"
                            >
                                Multi-Sig
                            </button>
                            <button
                                type="button"
                                on:click={() => (ownerMode = "custom")}
                                class="px-3 py-2 text-xs md:text-sm rounded-md transition-colors {ownerMode ===
                                'custom'
                                    ? 'bg-orange-500 text-black font-medium'
                                    : 'bg-background/50 border border-orange-500/20 hover:border-orange-500/40'}"
                            >
                                Custom Script
                            </button>
                        </div>

                        {#if ownerMode === "timelock"}
                            <div
                                class="space-y-3 p-4 bg-orange-500/5 rounded-lg border border-orange-500/10"
                            >
                                <div>
                                    <Label
                                        for="ownerAddress"
                                        class="text-xs font-medium mb-1.5 block text-foreground/80"
                                    >
                                        Owner Address
                                    </Label>
                                    <Input
                                        id="ownerAddress"
                                        type="text"
                                        bind:value={ownerAddress}
                                        placeholder="Enter address"
                                        class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50 text-xs"
                                    />
                                </div>
                                <div>
                                    <Label
                                        for="ownerBlockHeight"
                                        class="text-xs font-medium mb-1.5 block text-foreground/80"
                                    >
                                        Unlock Block Height
                                    </Label>
                                    <Input
                                        id="ownerBlockHeight"
                                        type="number"
                                        bind:value={ownerBlockHeight}
                                        min="1"
                                        placeholder="Block height"
                                        class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50 text-xs"
                                    />
                                </div>
                            </div>
                        {:else if ownerMode === "multisig"}
                            <div
                                class="space-y-3 p-4 bg-orange-500/5 rounded-lg border border-orange-500/10"
                            >
                                <Label
                                    class="text-xs font-medium mb-1.5 block text-foreground/80"
                                >
                                    Wallet Addresses
                                </Label>
                                {#each multisigAddresses as addr, i}
                                    <div class="flex gap-2">
                                        <Input
                                            type="text"
                                            bind:value={multisigAddresses[i]}
                                            placeholder="Address {i + 1}"
                                            class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50 text-xs"
                                        />
                                        {#if multisigAddresses.length > 2}
                                            <button
                                                type="button"
                                                class="text-red-400 hover:text-red-300 px-2"
                                                on:click={() => {
                                                    multisigAddresses =
                                                        multisigAddresses.filter(
                                                            (_, idx) =>
                                                                idx !== i,
                                                        );
                                                }}
                                            >
                                                ✕
                                            </button>
                                        {/if}
                                    </div>
                                {/each}
                                <button
                                    type="button"
                                    class="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"
                                    on:click={() =>
                                        (multisigAddresses = [
                                            ...multisigAddresses,
                                            "",
                                        ])}
                                >
                                    + Add Address
                                </button>

                                <div class="mt-4">
                                    <Label
                                        class="text-xs font-medium mb-1.5 block text-foreground/80"
                                    >
                                        Required Signatures (M of N)
                                    </Label>
                                    <div class="flex items-center gap-2">
                                        <Input
                                            type="number"
                                            bind:value={multisigRequired}
                                            min="1"
                                            max={multisigAddresses.length}
                                            class="w-20 bg-background/50 border-orange-500/20 focus:border-orange-500/50 text-xs"
                                        />
                                        <span
                                            class="text-xs text-muted-foreground"
                                            >of {multisigAddresses.length} signatures
                                            required</span
                                        >
                                    </div>
                                </div>
                            </div>
                        {:else if ownerMode === "custom_pk"}
                            <div
                                class="space-y-3 p-4 bg-orange-500/5 rounded-lg border border-orange-500/10"
                            >
                                <div class="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-xs text-yellow-700">
                                    <strong>Important:</strong> Your current wallet will still be the only one authorized to perform the add/withdraw operations for contribution tokens during the campaign.
                                </div>
                                <div>
                                    <Label
                                        for="customOwnerAddress"
                                        class="text-xs font-medium mb-1.5 block text-foreground/80"
                                    >
                                        Owner Wallet Address (P2PK)
                                    </Label>
                                    <Input
                                        id="customOwnerAddress"
                                        type="text"
                                        bind:value={customOwnerAddressInput}
                                        placeholder="9..."
                                        class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50 text-xs font-mono"
                                    />

                                    {#if ownerErgoTreeHex}
                                        <p class="text-xs mt-2 text-green-400 break-all">
                                            ✓ Valid Address (Tree: {ownerErgoTreeHex.slice(0, 10)}...{ownerErgoTreeHex.slice(-8)})
                                        </p>
                                    {:else if customOwnerAddressInput}
                                        <p class="text-xs mt-2 text-red-400">
                                            ⚠ Invalid Ergo Address
                                        </p>
                                    {/if}

                                    <p class="text-xs mt-1 text-muted-foreground">
                                        Enter the standard Ergo address (starts with '9') that will own this campaign.
                                    </p>
                                </div>
                            </div>
                        {:else if ownerMode === "custom"}
                            <div
                                class="space-y-3 p-4 bg-orange-500/5 rounded-lg border border-orange-500/10"
                            >
                                <!-- Alert -->
                                <div class="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-md text-xs text-yellow-700">
                                    <strong>Important:</strong> The custom owner ErgoTree must meet specific pattern requirements.  
                                    In addition to being spendable, it must also allow self-spending to authorize contribution-token additions and withdrawals, and it must be implemented as a singleton to enable batch fund withdrawals.
                                </div>

                                <div>
                                    <Label
                                        for="ownerErgoTree"
                                        class="text-xs font-medium mb-1.5 block text-foreground/80"
                                    >
                                        ErgoTree Hex
                                    </Label>
                                    <textarea
                                        id="ownerErgoTree"
                                        bind:value={ownerErgoTreeHex}
                                        placeholder="0008cd..."
                                        class="w-full h-24 p-2 bg-background/50 border border-orange-500/20 rounded-md focus:border-orange-500/50 text-xs font-mono resize-none"
                                    ></textarea>
                                    <p
                                        class="text-xs mt-1 text-muted-foreground"
                                    >
                                        Paste the compiled ErgoTree hex string
                                        here.
                                    </p>
                                </div>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>

            <div
                class="step-card bg-card/50 backdrop-blur-sm border border-orange-500/10 rounded-xl p-6 md:p-8 shadow-lg relative overflow-hidden"
            >
                <div
                    class="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-orange-500 to-transparent opacity-50"
                ></div>
                <h3
                    class="text-xl font-semibold mb-6 text-orange-400 flex items-center gap-2"
                >
                    <span class="opacity-50">03.</span> Campaign Details
                </h3>

                <div class="grid grid-cols-1 gap-6">
                    <div class="form-group">
                        <Label
                            for="projectTitle"
                            class="text-sm font-medium mb-2 block text-foreground/90"
                            >Title</Label
                        >
                        <Input
                            type="text"
                            id="projectTitle"
                            bind:value={projectTitle}
                            placeholder="Name of your campaign"
                            required
                            class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50"
                        />
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div class="form-group">
                            <Label
                                for="projectImage"
                                class="text-sm font-medium mb-2 block text-foreground/90"
                                >Image URL</Label
                            >
                            <div class="relative">
                                <Input
                                    type="text"
                                    id="projectImage"
                                    bind:value={projectImage}
                                    placeholder="https://example.com/image.png"
                                    required
                                    class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50 pl-9"
                                />
                                <div
                                    class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                >
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><rect
                                            x="3"
                                            y="3"
                                            width="18"
                                            height="18"
                                            rx="2"
                                            ry="2"
                                        ></rect><circle
                                            cx="8.5"
                                            cy="8.5"
                                            r="1.5"
                                        ></circle><polyline
                                            points="21 15 16 10 5 21"
                                        ></polyline></svg
                                    >
                                </div>
                            </div>
                        </div>

                        <div class="form-group">
                            <Label
                                for="projectLink"
                                class="text-sm font-medium mb-2 block text-foreground/90"
                                >Website / Link</Label
                            >
                            <div class="relative">
                                <Input
                                    type="text"
                                    id="projectLink"
                                    bind:value={projectLink}
                                    placeholder="https://yourproject.com"
                                    required
                                    class="w-full bg-background/50 border-orange-500/20 focus:border-orange-500/50 pl-9"
                                />
                                <div
                                    class="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                                >
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        ><path
                                            d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
                                        ></path><path
                                            d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
                                        ></path></svg
                                    >
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="form-group">
                        <Label
                            for="projectDescription"
                            class="text-sm font-medium mb-2 block text-foreground/90"
                            >Description</Label
                        >
                        <div
                            class="relative editor-wrapper {contentTooLarge
                                ? 'border-red-500'
                                : ''}"
                        >
                            <textarea bind:this={editorElement}></textarea>

                            <div class="mt-2 space-y-1">
                                <div
                                    class="text-right text-xs {contentTooLarge
                                        ? 'text-red-400 font-semibold'
                                        : contentUsagePercentage > 80
                                          ? 'text-yellow-400'
                                          : 'text-muted-foreground'}"
                                >
                                    Campaign content: {contentBytesUsed} bytes
                                </div>

                                <div
                                    class="text-right text-xs {estimatedBoxSize >
                                    4096
                                        ? 'text-red-400 font-semibold'
                                        : estimatedBoxSize > 3700
                                          ? 'text-yellow-400'
                                          : 'text-muted-foreground'}"
                                >
                                    Est. total box size: {estimatedBoxSize} / 4096
                                    bytes ({contentUsagePercentage}%)
                                </div>

                                {#if contentUsagePercentage > 0}
                                    <div
                                        class="w-full bg-muted rounded-full h-1.5"
                                    >
                                        <div
                                            class="h-1.5 rounded-full transition-all duration-300 {contentTooLarge
                                                ? 'bg-red-500'
                                                : contentUsagePercentage > 80
                                                  ? 'bg-yellow-500'
                                                  : 'bg-orange-500'}"
                                            style="width: {Math.min(
                                                contentUsagePercentage,
                                                100,
                                            )}%"
                                        ></div>
                                    </div>
                                {/if}
                            </div>

                            {#if contentTooLarge}
                                <p
                                    class="text-red-400 text-xs mt-2 bg-red-500/10 p-2 rounded"
                                >
                                    ⚠️ {contentValidation.message ||
                                        "The campaign content is too large."}
                                </p>
                            {:else if contentUsagePercentage > 90}
                                <p
                                    class="text-yellow-400 text-xs mt-2 bg-yellow-500/10 p-2 rounded"
                                >
                                    ⚠️ You're using {contentUsagePercentage}% of
                                    the available box space. Consider keeping
                                    some room for safety.
                                </p>
                            {/if}
                        </div>
                    </div>
                </div>
            </div>

            <div
                class="form-actions mt-10 flex flex-col items-center justify-center gap-4"
            >
                <!-- Validation Helper Message -->
                {#if !tokenAmountToSellRaw || !exchangeRateRaw || !maxGoalPrecise || !projectTitle || !deadlineValueBlock || formErrors.tokenConflict || formErrors.goalOrder || contentTooLarge}
                    <div class="w-full max-w-2xl bg-blue-100 border-2 border-blue-600 rounded-lg p-4">
                        <p class="text-blue-950 font-bold mb-3 text-lg">📋 Complete these fields to launch:</p>
                        <ul class="text-base text-blue-900 font-semibold space-y-2 list-disc list-inside">
                            {#if !projectTitle}
                                <li>Project Title (required)</li>
                            {/if}
                            {#if !tokenAmountToSellRaw}
                                <li>Amount for Sale (required)</li>
                            {/if}
                            {#if !exchangeRateRaw}
                                <li>Token Price (required)</li>
                            {/if}
                            {#if !maxGoalPrecise}
                                <li>Maximum Goal (required)</li>
                            {/if}
                            {#if !deadlineValueBlock}
                                <li>Deadline (required)</li>
                            {/if}
                            {#if formErrors.tokenConflict}
                                <li class="text-red-300">⚠️ {formErrors.tokenConflict}</li>
                            {/if}
                            {#if formErrors.goalOrder}
                                <li class="text-red-300">⚠️ {formErrors.goalOrder}</li>
                            {/if}
                            {#if contentTooLarge}
                                <li class="text-red-300">⚠️ Campaign content exceeds box size limit</li>
                            {/if}
                        </ul>
                    </div>
                {/if}

                {#if errorMessage && !transactionId}
                    <div
                        class="w-full max-w-md bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center animate-pulse"
                    >
                        <p class="text-red-400 font-medium">{errorMessage}</p>
                    </div>
                {/if}

                {#if transactionId}
                    <div
                        class="result bg-green-500/10 border border-green-500/20 rounded-xl p-6 w-full max-w-xl text-center shadow-lg shadow-green-500/5"
                    >
                        <h4 class="text-green-400 font-bold text-lg mb-2">
                            Success!
                        </h4>
                        <p class="text-sm text-muted-foreground mb-3">
                            Your campaign has been submitted to the blockchain.
                        </p>
                        <a
                            href={$web_explorer_uri_tx + transactionId}
                            target="_blank"
                            rel="noopener noreferrer"
                            class="inline-flex items-center gap-2 text-orange-400 hover:text-orange-300 transition-colors bg-orange-500/5 px-4 py-2 rounded-lg border border-orange-500/20 hover:border-orange-500/40"
                        >
                            <span>{transactionId.slice(0, 8)}...</span>
                            <svg
                                width="12"
                                height="12"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                ><path
                                    d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                                ></path><polyline points="15 3 21 3 21 9"
                                ></polyline><line x1="10" y1="14" x2="21" y2="3"
                                ></line></svg
                            >
                        </a>
                        <p class="text-xs text-muted-foreground mt-4">
                            Your campaign is now live and accepting contributions!
                        </p>
                    </div>
                {:else}
                    <div class="w-full flex flex-col gap-3">
                        <!-- Preview Button (works without ERG) -->
                        <Button
                            on:click={() => {
                                console.log("🎯 PREVIEW BUTTON CLICKED!");
                                
                                // Show campaign preview without blockchain submission
                                const preview = `🎯 CAMPAIGN PREVIEW - Ready for Blockchain Submission

📋 BASIC INFO:
• Title: ${projectTitle || 'Not set'}
• Category: Emergency Relief
• Location: ${location || 'Not set'}

💰 FUNDING DETAILS:
• Reward Token: ${rewardTokenName || 'Not selected'}
• Tokens for Sale: ${tokenAmountToSellRaw || 0}
• Token Price: ${exchangeRateRaw || 0} ERG
• Funding Goal: ${maxGoalPrecise || 0} ERG
• Deadline: Block ${deadlineValueBlock || 0}

✅ VERIFICATION STATUS:
• Location Anchoring: ${location ? '✓' : '✗'}
• Document Upload: ${emergencyDocuments.length > 0 ? '✓' : '✗'}
• Community Voting: Enabled
• 4-Stage Release: 40%-30%-30% configured

⚡ BLOCKCHAIN INTEGRATION:
• Smart Contract: Ready
• Wallet Connected: ${$walletConnected ? '✓' : '✗'}
• Network: Mainnet
• Transaction Type: Campaign Creation

⚠️ TO SUBMIT TO BLOCKCHAIN:
You need ~0.002 ERG for transaction fees.`;
                                
                                console.log(preview);
                                alert(preview);
                                console.log("✅ Alert shown!");
                            }}
                            disabled={!tokenAmountToSellRaw ||
                                !exchangeRateRaw ||
                                !maxGoalPrecise ||
                                !projectTitle ||
                                !deadlineValueBlock ||
                                !!formErrors.tokenConflict ||
                                !!formErrors.goalOrder ||
                                contentTooLarge}
                            class="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-400 hover:to-blue-500 text-white border-none h-12 text-lg font-bold rounded-lg shadow-lg shadow-blue-500/20 transition-all duration-200 hover:scale-[1.02] hover:shadow-blue-500/40 disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none disabled:grayscale"
                        >
                            👁️ Preview Campaign (No ERG Required)
                        </Button>

                        <!-- Real Submit Button (requires ERG) -->
                        <Button
                            on:click={handleSubmit}
                            disabled={isSubmitting ||
                                !tokenAmountToSellRaw ||
                                !exchangeRateRaw ||
                                !maxGoalPrecise ||
                                !projectTitle ||
                                !deadlineValueBlock ||
                                !!formErrors.tokenConflict ||
                                !!formErrors.goalOrder ||
                                contentTooLarge}
                            class="w-full bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 text-black border-none h-12 text-lg font-bold rounded-lg shadow-lg shadow-orange-500/20 transition-all duration-200 hover:scale-[1.02] hover:shadow-orange-500/40 disabled:opacity-50 disabled:hover:scale-100 disabled:hover:shadow-none disabled:grayscale"
                        >
                            {isSubmitting
                                ? statusMessage || "Submitting Campaign..."
                                : "🚀 Submit to Blockchain (Requires ~0.002 ERG)"}
                        </Button>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    .project-title {
        font-size: 2.5rem;
        color: orange;
        font-family: "Russo One", sans-serif;
        letter-spacing: 0.02em;
        text-shadow: 0 0 40px rgba(255, 165, 0, 0.2);
    }

    .step-card {
        transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
    }

    .step-card:hover {
        transform: translateY(-2px);
        box-shadow: 0 10px 30px -10px rgba(255, 165, 0, 0.1);
    }

    @media (max-width: 768px) {
        .project-title {
            font-size: 1.8rem;
        }
    }

    :global(.editor-wrapper .EasyMDEContainer .CodeMirror) {
        background-color: hsl(var(--background) / 0.5) !important;
        color: hsl(var(--foreground)) !important;
        border-color: rgba(249, 115, 22, 0.2) !important;
        border-radius: 0 0 0.5rem 0.5rem;
        font-family: inherit;
    }

    :global(.editor-wrapper .editor-toolbar) {
        background-color: hsl(var(--muted) / 0.5) !important;
        border-color: rgba(249, 115, 22, 0.2) !important;
        border-radius: 0.5rem 0.5rem 0 0;
    }

    :global(.editor-wrapper .editor-toolbar button) {
        color: hsl(var(--muted-foreground)) !important;
        transition: all 0.2s ease;
    }

    :global(.editor-wrapper .editor-toolbar button:hover),
    :global(.editor-wrapper .editor-toolbar button.active) {
        background-color: rgba(249, 115, 22, 0.15) !important;
        border-color: transparent !important;
        color: #f97316 !important;
    }

    :global(.editor-wrapper .CodeMirror-cursor) {
        border-left: 2px solid #f97316 !important;
    }

    :global(.CodeMirror-placeholder) {
        color: hsl(var(--muted-foreground)) !important;
        opacity: 0.7;
    }

    :global(.editor-toolbar i.separator) {
        border-left-color: hsl(var(--border)) !important;
        border-right-color: transparent !important;
    }
    :global(.dark .editor-wrapper .EasyMDEContainer .CodeMirror) {
        background-color: rgba(0, 0, 0, 0.3) !important;
    }
    :global(.dark .editor-wrapper .editor-toolbar) {
        background-color: rgba(0, 0, 0, 0.5) !important;
    }
</style>

<!-- Token Creation Modal -->
<Dialog.Root bind:open={showCreateTokenModal}>
    <Dialog.Content class="max-w-2xl">
        <Dialog.Header>
            <Dialog.Title class="text-2xl font-bold text-orange-400">
                🪙 Create New Emergency Token
            </Dialog.Title>
            <Dialog.Description class="text-muted-foreground">
                Mint a new token for your emergency relief campaign. This token will be used to reward contributors.
            </Dialog.Description>
        </Dialog.Header>
        
        <div class="space-y-6 py-4">
            <!-- Token Name -->
            <div class="space-y-2">
                <Label for="token-name" class="text-sm font-medium">
                    Token Name <span class="text-red-500">*</span>
                </Label>
                <Input
                    id="token-name"
                    bind:value={newTokenName}
                    placeholder="e.g., Emergency Relief Token"
                    class="w-full"
                />
                <p class="text-xs text-muted-foreground">
                    Full descriptive name for your token
                </p>
            </div>

            <!-- Token Symbol -->
            <div class="space-y-2">
                <Label for="token-symbol" class="text-sm font-medium">
                    Token Symbol <span class="text-red-500">*</span>
                </Label>
                <Input
                    id="token-symbol"
                    bind:value={newTokenSymbol}
                    placeholder="e.g., ERT"
                    class="w-full uppercase"
                    maxlength="8"
                />
                <p class="text-xs text-muted-foreground">
                    Short ticker symbol (2-8 characters, will be uppercase)
                </p>
            </div>

            <!-- Supply & Decimals Row -->
            <div class="grid grid-cols-2 gap-4">
                <div class="space-y-2">
                    <Label for="token-supply" class="text-sm font-medium">
                        Total Supply <span class="text-red-500">*</span>
                    </Label>
                    <Input
                        id="token-supply"
                        type="number"
                        bind:value={newTokenSupply}
                        placeholder="1000000"
                        min="1"
                        class="w-full"
                    />
                    <p class="text-xs text-muted-foreground">
                        Total tokens to mint
                    </p>
                </div>

                <div class="space-y-2">
                    <Label for="token-decimals" class="text-sm font-medium">
                        Decimals <span class="text-red-500">*</span>
                    </Label>
                    <Input
                        id="token-decimals"
                        type="number"
                        bind:value={newTokenDecimals}
                        placeholder="0"
                        min="0"
                        max="9"
                        class="w-full"
                    />
                    <p class="text-xs text-muted-foreground">
                        Decimal places (0-9)
                    </p>
                </div>
            </div>

            <!-- Token Description -->
            <div class="space-y-2">
                <Label for="token-description" class="text-sm font-medium">
                    Description (Optional)
                </Label>
                <Input
                    id="token-description"
                    bind:value={newTokenDescription}
                    placeholder="Brief description of the token purpose"
                    class="w-full"
                />
                <p class="text-xs text-muted-foreground">
                    Brief description of what this token represents
                </p>
            </div>

            <!-- Info Alert -->
            <div class="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                <div class="flex gap-3">
                    <div class="text-blue-400 text-xl">ℹ️</div>
                    <div class="text-sm text-muted-foreground space-y-2">
                        <p><strong class="text-foreground">Token Minting Requirements:</strong></p>
                        <ul class="list-disc list-inside space-y-1 text-xs">
                            <li>Requires connected wallet with ERG balance</li>
                            <li>Minting fee: ~0.001 ERG (transaction cost)</li>
                            <li>Tokens will be minted to your wallet address</li>
                            <li>Once created, you can use it immediately in your campaign</li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>

        <Dialog.Footer class="flex gap-2 justify-end">
            <Button
                variant="outline"
                on:click={() => {
                    showCreateTokenModal = false;
                    newTokenName = "";
                    newTokenSymbol = "";
                    newTokenSupply = 0;
                    newTokenDecimals = 0;
                    newTokenDescription = "";
                }}
            >
                Cancel
            </Button>
            <Button
                disabled={!newTokenName || !newTokenSymbol || newTokenSupply <= 0 || !$walletConnected}
                class="bg-orange-500 hover:bg-orange-600"
                on:click={async () => {
                    try {
                        console.log("🪙 Starting token minting...");
                        
                        // Import required modules from Fleet SDK
                        const { OutputBuilder, TransactionBuilder, RECOMMENDED_MIN_FEE_VALUE } = await import("@fleet-sdk/core");
                        
                        // Get wallet address
                        const changeAddr = await window.ergo.get_change_address();
                        console.log("💰 Wallet address:", changeAddr);
                        
                        // Get UTXOs (unspent transaction outputs)
                        const utxos = await window.ergo.get_utxos();
                        console.log("📦 Available UTXOs:", utxos?.length || 0);
                        
                        if (!utxos || utxos.length === 0) {
                            throw new Error("No UTXOs available. You need ERG in your wallet to mint tokens.");
                        }
                        
                        // Calculate token amount (considering decimals)
                        const tokenAmount = BigInt(newTokenSupply) * BigInt(10 ** newTokenDecimals);
                        
                        // Build token minting transaction
                        const unsignedTx = new TransactionBuilder(await platform.get_current_height())
                            .from(utxos)
                            .to(
                                new OutputBuilder(
                                    RECOMMENDED_MIN_FEE_VALUE, // Minimum ERG value for token box
                                    changeAddr
                                ).mintToken({
                                    amount: tokenAmount.toString(),
                                    name: newTokenName,
                                    decimals: newTokenDecimals,
                                    description: newTokenDescription || `${newTokenSymbol} token for emergency campaigns`
                                })
                            )
                            .sendChangeTo(changeAddr)
                            .payMinFee()
                            .build()
                            .toEIP12Object();
                        
                        console.log("📝 Unsigned transaction:", unsignedTx);
                        
                        // Sign transaction with wallet
                        const signedTx = await window.ergo.sign_tx(unsignedTx);
                        console.log("✅ Transaction signed");
                        
                        // Submit transaction to blockchain
                        const txId = await window.ergo.submit_tx(signedTx);
                        console.log("🎉 Token minted! Transaction ID:", txId);
                        
                        alert(`🎉 SUCCESS!\n\nToken "${newTokenName}" (${newTokenSymbol}) minted!\n\nTransaction ID: ${txId}\n\nThe token will appear in your wallet shortly.`);
                        
                        // Close modal and refresh tokens
                        showCreateTokenModal = false;
                        newTokenName = "";
                        newTokenSymbol = "";
                        newTokenSupply = 0;
                        newTokenDecimals = 0;
                        newTokenDescription = "";
                        
                        // Refresh user tokens
                        await getUserTokens();
                        
                    } catch (error) {
                        console.error("❌ Token minting failed:", error);
                        alert(`❌ Token Minting Failed!\n\n${error.message}\n\nMost common cause: Insufficient ERG in wallet.\nYou need ~0.001 ERG for transaction fees.`);
                    }
                }}
            >
                {$walletConnected ? '✨ Mint Token' : '🔌 Connect Wallet First'}
            </Button>
        </Dialog.Footer>
    </Dialog.Content>
</Dialog.Root>

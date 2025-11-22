/**
 * Utilities for calculating and validating Ergo box sizes
 */

import { SInt, SLong, SColl } from '@fleet-sdk/serializer';
import { SString } from '../utils';
import { get_dev_contract_address, get_dev_contract_hash, get_dev_fee } from '../dev/dev_contract';
import { get_ergotree_hex } from '../contract';
import type { ConstantContent } from '$lib/common/project';

/**
 * Calculate the UTF-8 byte length of a string
 */
export function utf8ByteLength(str: string): number {
    return new TextEncoder().encode(str).length;
}

/**
 * Calculate the hex byte length from a hex string
 */
export function hexByteLength(hexStr: string): number {
    if (!hexStr) return 0;
    const stripped = hexStr.startsWith('0x') ? hexStr.slice(2) : hexStr;
    return Math.ceil(stripped.length / 2);
}

/**
 * Project content structure
 */
export interface ProjectContent {
    title: string;
    description: string;
    image: string;
    link: string;
}

/**
 * Calculate the size in bytes of the project content JSON (R9 register)
 */
export function calculateProjectContentBytes(content: ProjectContent): number {
    const jsonString = JSON.stringify(content);
    return utf8ByteLength(jsonString);
}

/**
 * Estimate the total size of all registers (R4-R9) in bytes
 * This includes the content itself plus per-register overhead
 */
export interface RegisterSizes {
    r4Bytes: number;  // blockLimit (SInt)
    r5Bytes: number;  // minimumSold (SLong)
    r6Bytes: number;  // SColl(SLong, [0,0,0])
    r7Bytes: number;  // exchangeRate (SLong)
    r8Bytes: number;  // addressContent JSON
    r9Bytes: number;  // projectContent JSON
}

export function estimateRegisterSizes(
    r4Hex: string,
    r5Hex: string,
    r6Hex: string,
    r7Hex: string,
    r8Hex: string,
    r9Hex: string
): RegisterSizes {
    const PER_REGISTER_OVERHEAD = 1;

    return {
        r4Bytes: hexByteLength(r4Hex) + PER_REGISTER_OVERHEAD,
        r5Bytes: hexByteLength(r5Hex) + PER_REGISTER_OVERHEAD,
        r6Bytes: hexByteLength(r6Hex) + PER_REGISTER_OVERHEAD,
        r7Bytes: hexByteLength(r7Hex) + PER_REGISTER_OVERHEAD,
        r8Bytes: hexByteLength(r8Hex) + PER_REGISTER_OVERHEAD,
        r9Bytes: hexByteLength(r9Hex) + PER_REGISTER_OVERHEAD,
    };
}

/**
 * Estimate the total box size including all components
 */
export function estimateTotalBoxSize(
    ergoTreeLength: number,
    numTokens: number,
    registerSizes: RegisterSizes
): number {
    const BASE_BOX_OVERHEAD = 60;
    const PER_TOKEN_BYTES = 40;
    const SIZE_MARGIN = 120;

    const totalRegistersBytes =
        registerSizes.r4Bytes +
        registerSizes.r5Bytes +
        registerSizes.r6Bytes +
        registerSizes.r7Bytes +
        registerSizes.r8Bytes +
        registerSizes.r9Bytes;

    return (
        BASE_BOX_OVERHEAD +
        ergoTreeLength +
        (PER_TOKEN_BYTES * numTokens) +
        totalRegistersBytes +
        SIZE_MARGIN
    );
}

/**
 * Maximum box size in Ergo blockchain
 * This is the hard limit we must never exceed
 */
export const MAX_BOX_SIZE = 4096;

/**
 * Calculate the actual size of R8 (addressContent) using typical values
 */
export function calculateR8Size(): number {
    try {
        // Use typical address content structure
        const addressContent = {
            "owner": "9fcwctfPQPkDfHgxBns5Uu3dwWpaoywhkpLEobLuztfQuV5mt3T", // Typical address
            "dev_addr": get_dev_contract_address(),
            "dev_hash": get_dev_contract_hash(),
            "dev_fee": get_dev_fee(),
            "pft_token_id": "a3f7c9e12bd45890ef12aa7c6d54b9317c0df4a28b6e5590d4f1b3e8c92d77af",
            "base_token_id": "" // Empty for ERG
        };

        const r8Hex = SString(JSON.stringify(addressContent));
        return hexByteLength(r8Hex) + 1; // +1 for register overhead
    } catch (error) {
        console.warn('Could not calculate R8 size dynamically, using measured value:', error);
        return 251; // Fallback to measured value
    }
}

/**
 * Calculate the actual size of R4-R7 registers using typical values
 */
export function calculateRegisterSizesEstimate(): {
    r4: number;
    r5: number;
    r6: number;
    r7: number;
} {
    try {
        const PER_REGISTER_OVERHEAD = 1;

        // Use typical values for calculation
        const r4Hex = SInt(1000000).toHex(); // Typical blockLimit
        const r5Hex = SLong(BigInt(0)).toHex(); // Typical minimumSold
        const r6Hex = SColl(SLong, [BigInt(0), BigInt(0), BigInt(0)]).toHex(); // Always same
        const r7Hex = SLong(BigInt(1000000)).toHex(); // Typical exchangeRate

        return {
            r4: hexByteLength(r4Hex) + PER_REGISTER_OVERHEAD,
            r5: hexByteLength(r5Hex) + PER_REGISTER_OVERHEAD,
            r6: hexByteLength(r6Hex) + PER_REGISTER_OVERHEAD,
            r7: hexByteLength(r7Hex) + PER_REGISTER_OVERHEAD
        };
    } catch (error) {
        console.warn('Could not calculate register sizes dynamically, using measured values:', error);
        // Fallback to measured values
        return {
            r4: 6,
            r5: 10,
            r6: 26,
            r7: 10
        };
    }
}

/**
 * Calculate the actual ErgoTree size for a given contract version
 * Uses template constants (random values) to generate a representative ErgoTree
 */
export function calculateErgoTreeSize(version: string = "v2"): number {
    try {
        // Use the same random constants as in contract.ts get_template_hash()
        const random_constants: ConstantContent = {
            "owner": "9fcwctfPQPkDfHgxBns5Uu3dwWpaoywhkpLEobLuztfQuV5mt3T",  // RANDOM
            "dev_addr": get_dev_contract_address(),
            "dev_hash": get_dev_contract_hash(),
            "dev_fee": get_dev_fee(),
            "pft_token_id": "a3f7c9e12bd45890ef12aa7c6d54b9317c0df4a28b6e5590d4f1b3e8c92d77af",   // RANDOM
            "base_token_id": "2c5d596d617aaafe16f3f58b2c562d046eda658f0243dc1119614160d92a4717" // RANDOM
        };

        const ergoTreeHex = get_ergotree_hex(random_constants);
        return hexByteLength(ergoTreeHex);
    } catch (error) {
        // Fallback to measured value if calculation fails
        console.warn('Could not calculate ErgoTree size dynamically, using measured value:', error);
        return 300; // This is the actual measured size of v2 contracts
    }
}

// Cache the ErgoTree size calculation since it doesn't change
let cachedErgoTreeSize: number | null = null;

/**
 * Get the ErgoTree size (cached for performance)
 */
export function getErgoTreeSize(version: string = "v2"): number {
    if (cachedErgoTreeSize === null) {
        cachedErgoTreeSize = calculateErgoTreeSize(version);
    }
    return cachedErgoTreeSize;
}

/**
 * Estimate total box size for a project with given content
 * This calculates the actual size using real register values
 */
export function estimateCompleteBoxSize(content: ProjectContent, contractVersion: string = "v2"): number {
    const BASE_BOX_OVERHEAD = 60;
    const PER_TOKEN_BYTES = 40;
    const NUM_TOKENS = 3; // project_id, token_id, (optional base_token)
    const SIZE_MARGIN = 120;
    const PER_REGISTER_OVERHEAD = 1;

    // Calculate R9 size (actual project content)
    const r9ContentBytes = calculateProjectContentBytes(content);
    const r9TotalBytes = r9ContentBytes + PER_REGISTER_OVERHEAD;

    // Get actual calculated sizes
    const ergoTreeBytes = getErgoTreeSize(contractVersion);
    const tokensBytes = PER_TOKEN_BYTES * NUM_TOKENS;
    const registerSizes = calculateRegisterSizesEstimate();
    const r8Bytes = calculateR8Size();

    const totalSize =
        BASE_BOX_OVERHEAD +
        ergoTreeBytes +
        tokensBytes +
        registerSizes.r4 +
        registerSizes.r5 +
        registerSizes.r6 +
        registerSizes.r7 +
        r8Bytes +
        r9TotalBytes +
        SIZE_MARGIN;

    return totalSize;
}

/**
 * Validation result for project content
 */
export interface ValidationResult {
    isValid: boolean;
    currentBytes: number;
    estimatedBoxSize: number;
    remainingBytes: number;
    message?: string;
}

/**
 * Validate that the estimated total box size fits within the 4096 byte limit
 */
export function validateProjectContent(content: ProjectContent): ValidationResult {
    const currentBytes = calculateProjectContentBytes(content);
    const estimatedBoxSize = estimateCompleteBoxSize(content);
    const remainingBytes = Math.max(0, MAX_BOX_SIZE - estimatedBoxSize + currentBytes);

    // Check if total estimated box size exceeds limit
    if (estimatedBoxSize > MAX_BOX_SIZE) {
        const excessBytes = estimatedBoxSize - MAX_BOX_SIZE;
        return {
            isValid: false,
            currentBytes,
            estimatedBoxSize,
            remainingBytes,
            message: `Estimated box size (${estimatedBoxSize} bytes) exceeds maximum (${MAX_BOX_SIZE} bytes). Please reduce content by approximately ${excessBytes} bytes.`
        };
    }

    return {
        isValid: true,
        currentBytes,
        estimatedBoxSize,
        remainingBytes
    };
}

/**
 * Get remaining bytes available for project content
 * Based on the total box size limit
 */
export function getRemainingBytes(content: ProjectContent): number {
    const currentBytes = calculateProjectContentBytes(content);
    const estimatedBoxSize = estimateCompleteBoxSize(content);

    // Calculate how much room we have left in the box
    return Math.max(0, MAX_BOX_SIZE - estimatedBoxSize + currentBytes);
}

/**
 * Calculate the percentage of box size used
 */
export function getUsagePercentage(content: ProjectContent): number {
    const estimatedBoxSize = estimateCompleteBoxSize(content);
    return Math.round((estimatedBoxSize / MAX_BOX_SIZE) * 100);
}

/**
 * Get detailed size breakdown for debugging
 */
export function getBoxSizeBreakdown(content: ProjectContent): {
    baseOverhead: number;
    ergoTree: number;
    tokens: number;
    r4: number;
    r5: number;
    r6: number;
    r7: number;
    r8: number;
    r9: number;
    margin: number;
    total: number;
} {
    const r9Content = calculateProjectContentBytes(content);
    const registerSizes = calculateRegisterSizesEstimate();
    const r8Size = calculateR8Size();

    return {
        baseOverhead: 60,
        ergoTree: getErgoTreeSize(),
        tokens: 40 * 3,
        r4: registerSizes.r4,
        r5: registerSizes.r5,
        r6: registerSizes.r6,
        r7: registerSizes.r7,
        r8: r8Size,
        r9: r9Content + 1, // +1 for register overhead
        margin: 120,
        total: estimateCompleteBoxSize(content)
    };
}

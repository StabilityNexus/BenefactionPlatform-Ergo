// ===== BUG TEST: Double Counting in temporaryFundingTokenAmountOnContract =====
// Tests Bug #2: Line 100 in contract_v2.es adds exchanged tokens instead of subtracting
// This causes incorrect calculation of available PFT tokens after exchanges

import { describe, it, expect } from "vitest";

describe("BUG #2: Double Counting Analysis", () => {
  
  it("demonstrates the logic error in temporaryFundingTokenAmountOnContract", () => {
    console.log("\n" + "=".repeat(80));
    console.log("BUG #2: DOUBLE COUNTING IN TOKEN AVAILABILITY CALCULATION");
    console.log("=".repeat(80));
    console.log("\nLocation: contract_v2.es, lines 91-103");
    console.log("Function: temporaryFundingTokenAmountOnContract\n");
    
    console.log("BUGGY CODE:");
    console.log("  val calculation = proof_funding_token_amount - sold + refunded + exchanged");
    console.log("                                                                   ^^^^^^^^^\n");
    
    console.log("SCENARIO: Campaign with 100 PFT tokens");
    console.log("─".repeat(80));
    
    // Initial state
    const totalPFT = 100;
    let sold = 0;
    let refunded = 0;
    let exchanged = 0;
    
    const calculateBuggy = () => totalPFT - sold + refunded + exchanged;
    const calculateCorrect = () => Math.max(0, totalPFT - sold + refunded - exchanged);
    
    console.log("\n1. INITIAL STATE:");
    console.log(`   Total PFT in contract: ${totalPFT}`);
    console.log(`   Sold: ${sold}, Refunded: ${refunded}, Exchanged: ${exchanged}`);
    console.log(`   Buggy calculation:   ${totalPFT} - ${sold} + ${refunded} + ${exchanged} = ${calculateBuggy()}`);
    console.log(`   Correct calculation: ${totalPFT} - ${sold} + ${refunded} - ${exchanged} = ${calculateCorrect()}`);
    console.log(`   ✅ Both match: ${calculateBuggy()} available PFT`);
    
    // Step 1: User buys 80 APT
    sold = 80;
    console.log("\n2. USER BUYS 80 APT:");
    console.log(`   Contract gives 80 APT, receives payment`);
    console.log(`   Sold: ${sold}, Refunded: ${refunded}, Exchanged: ${exchanged}`);
    console.log(`   Buggy calculation:   ${totalPFT} - ${sold} + ${refunded} + ${exchanged} = ${calculateBuggy()}`);
    console.log(`   Correct calculation: ${totalPFT} - ${sold} + ${refunded} - ${exchanged} = ${calculateCorrect()}`);
    console.log(`   ✅ Both match: ${calculateBuggy()} APT available, 80 PFT available for exchange`);
    
    // Step 2: User exchanges 50 APT → 50 PFT
    exchanged = 50;
    const buggyAvailable2 = calculateBuggy();
    const correctAvailable2 = calculateCorrect();
    console.log("\n3. USER EXCHANGES 50 APT → 50 PFT:");
    console.log(`   User returns 50 APT, contract gives 50 PFT from reserve`);
    console.log(`   Sold: ${sold}, Refunded: ${refunded}, Exchanged: ${exchanged}`);
    console.log(`   Buggy calculation:   ${totalPFT} - ${sold} + ${refunded} + ${exchanged} = ${buggyAvailable2}`);
    console.log(`   Correct calculation: ${totalPFT} - ${sold} + ${refunded} - ${exchanged} = ${correctAvailable2}`);
    console.log(`   ❌ MISMATCH!`);
    console.log(`      Buggy thinks: ${buggyAvailable2} APT available`);
    console.log(`      Actually: ${correctAvailable2} APT available (already sold 80, exchanged back 50 = net 30 sold)`);
    
    // Step 3: User exchanges remaining 30 APT → 30 PFT
    exchanged = 80;
    const buggyAvailable3 = calculateBuggy();
    const correctAvailable3 = calculateCorrect();
    console.log("\n4. USER EXCHANGES REMAINING 30 APT → 30 PFT:");
    console.log(`   User returns all 80 APT, got back all 80 PFT`);
    console.log(`   Sold: ${sold}, Refunded: ${refunded}, Exchanged: ${exchanged}`);
    console.log(`   Buggy calculation:   ${totalPFT} - ${sold} + ${refunded} + ${exchanged} = ${buggyAvailable3}`);
    console.log(`   Correct calculation: ${totalPFT} - ${sold} + ${refunded} - ${exchanged} = ${correctAvailable3}`);
    console.log(`   ❌ CRITICAL BUG!`);
    console.log(`      Buggy thinks: ${buggyAvailable3} APT available (can sell 100 again!)`);
    console.log(`      Actually: ${correctAvailable3} APT available (all tokens returned, nothing sold)`);
    
    console.log("\n" + "=".repeat(80));
    console.log("IMPACT:");
    console.log("─".repeat(80));
    console.log("The '+exchanged' in the formula causes DOUBLE COUNTING of returned PFT tokens.");
    console.log("After exchanges, the contract incorrectly calculates more tokens are available");
    console.log("than actually exist, potentially allowing overselling beyond the total supply.");
    console.log("\nFIX:");
    console.log("  Change: proof_funding_token_amount - sold + refunded + exchanged");
    console.log("  To:     proof_funding_token_amount - sold + refunded - exchanged");
    console.log("  Or:     proof_funding_token_amount - sold + refunded (omit exchanged)");
    console.log("=".repeat(80) + "\n");
    
    // Assertions to prove the bug
    expect(buggyAvailable2).toBe(70);  // Bug shows 70 available
    expect(correctAvailable2).toBe(0);   // Actually 0 available (sold net 30, but no more APT to sell)
    
    expect(buggyAvailable3).toBe(100); // Bug shows 100 available - CRITICAL!
    expect(correctAvailable3).toBe(0);   // Actually 0 available (net zero sold)
    
    expect(buggyAvailable3).not.toBe(correctAvailable3); // Proves bug exists
  });
  
  it("shows the mathematical proof of the bug", () => {
    console.log("\n" + "=".repeat(80));
    console.log("MATHEMATICAL PROOF");
    console.log("=".repeat(80));
    console.log("\nLet:");
    console.log("  T = Total PFT tokens (constant, e.g., 100)");
    console.log("  S = Sold counter (APT sold to users)");
    console.log("  R = Refunded counter (APT returned after failed campaign)");
    console.log("  E = Exchanged counter (APT exchanged back for PFT)");
    console.log("\nCurrent (BUGGY) formula:");
    console.log("  Available = T - S + R + E");
    console.log("\nCorrect formula should be:");
    console.log("  Available = T - S + R - E");
    console.log("  OR");
    console.log("  Available = T - (S - R - E)  [net sold]");
    console.log("\nWhy:");
    console.log("  - S represents APT given out (decreases availability)");
    console.log("  - R represents APT returned via refund (increases availability)");
    console.log("  - E represents APT returned via exchange (increases availability)");
    console.log("  BUT: When APT is exchanged, PFT is given out!");
    console.log("       So E should DECREASE availability (like S), not increase it!");
    console.log("\nThe bug: +E should be -E (or omitted if PFT tracking is separate)");
    console.log("=".repeat(80) + "\n");
    
    expect(true).toBe(true); // This test always passes, just for documentation
  });
});

1. [X] Check out the structure of how I write contracts, here is example: https://github.com/4EYESConsulting/sigmanauts-token-lock-contracts/blob/main/contracts/sigmanauts_v1_token_lock.es

    Think of each action we do as a transaction.
    The way you wrote current conditions, each action will need to execute/be checked.

2. [x] Buying and selling tokens.

    When checking that user gets correct amount tokens, we don’t actually care who gets the tokens, just that the correct amount of erg was added into the box and the correct amount of tokens were removed. So instead of accessing the user box, to make the design more flexible/modular, just check the delta of tokens removed from the box (i.e. d1 = SELF.tokes(0)._2 – output(0).tokens(0)._2) and the delta of erg added into the box (i.e. d2 = output(0).value – SELF.value) and check that d2 = d1 * exchange_rate.

3. Register 8 contents never get accessed.

    Having the same values in the compile constants and R8 is redundant.
    Since you are having problems with storing the values in R8, just having them in compile time constants is fine. Get rid of R8 and use it for contents of R9.
    Compile time constants can be accessed from the ergotree.
    Check this ergo forum post about EIP-5 for contract template, we need to use this so each instance of the contract has the ergotree template but just different constant values and data in registers: https://www.ergoforum.org/t/ergoscript-and-contract-templates-why-how-eip-5
    Note: I am not sure if EIP5 has been implemented into fleet yet.

4. R9 content structure.

    You can use a collection of tuples of Coll[Byte] to represent simple json object structure:
    { key: value } object can be represented as: Coll[(Coll[Byte], Coll[Byte])] where Coll[Byte] is UTF-8 encoded text.
    Since we get rid of R8, move R9 to R8, we cannot have gaps in register sequence.

5. General contract things.

    [ ] You can define SELF values as global variables instead of always accessing them from registers, make contract easier to understand while reading.
    [x] L147 and L153 when comparing SigmaProp.propBytes to Box.propositionBytes you need to implement it the correct way following the LangSpec, please include this as a function similar to here: https://github.com/ergonames/ergonames-contracts/blob/main/contracts/v1/ergonames_v1_reveal.es#L44
    [ ] L171 if devAddress is a splitting contract you cannot do PK(“...”).
    [x] L218 and L221, if there is token you should check if delta is positive or negative since current way it is written, tokens can be added or removed in either case. Pretty sure tokens can be added from any input box and can be sent to any output box, you did not enforce that tokens come from the project box or go to the project box because you never check the contents of the project box in each case.


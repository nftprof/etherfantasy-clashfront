import 'tailwindcss/tailwind.css';
import React, {Children, useEffect, useRef, useState} from 'react'
import {tokenMap} from "@ui/landSelector/UserActiveTokenList";
import { animateScroll } from "react-scroll";
import { capitalizeFirstLetter } from '@helpers/helpers'

/**
 * Mint Tokens Widget
 * @constructor
 */
function MintTokensWidget({ selectedTokens, resetSelectedTokens, removeSelectedToken, mintSelectedTokens }) {
    const tokenDivRef = useRef();
    const prevCountRef = useRef();
    const [ tokensForMint, setTokensForMint ] = useState([]);

    useEffect(() => {
        // We want to scroll the DIV box to the bottom if we add a new token Element
        // This will help give a nice visual representation
        // However we need to add a check in to ensure when we 'remove' a token we do not scroll
        // to the bottom of the div
        if(selectedTokens.length > (prevCountRef as any).current) {
            animateScroll.scrollToBottom({
                containerId: "overflow-div"
            });
        }

        prevCountRef.current = selectedTokens.length;

    }, [ selectedTokens ])

    useEffect(() => {
        let internalTokenList = [];
        selectedTokens.map((token) => {
            internalTokenList.push(token.paddedTokenId);
        })

        setTokensForMint(internalTokenList);

    }, [ selectedTokens ])

    useEffect(() => {

    }, [ tokensForMint ])

    return (
        <div className={`max-w-[550px] z-[999] w-full absolute bottom-0 m-4 right-0 transform`}>
            <div className={`flex flex-col w-full border items-center justify-center space-y-8 text-white text-center z-[400] w-full bg-haiti-400 rounded-lg p-8 px-10 h-full`}>
                <div className={`space-y-2`}>
                    <span className={`text-xl m-0 font-body`}>Selected Land ( {selectedTokens[0]?.type} x{selectedTokens?.length})</span>
                    <p>If you're happy with your selection below you can select the land to mint,
                       otherwise press reset to start your selection again.
                    </p>
                </div>

                <div id={`overflow-div`} ref={tokenDivRef} className={`w-full flex flex-wrap gap-2 grid grid-cols-4 max-h-[120px] overflow-scroll disable-scrollbars`}>
                    {selectedTokens.map((tokenDetails, key) => {
                        return (
                            <div key={key} className={`${tokenMap[capitalizeFirstLetter(selectedTokens[0]?.type)]} rounded-full px-2 uppercase py-1 text-xs flex justify-center items-center space-x-2`}>
                                <span>{tokenDetails.paddedTokenId}</span>
                                <span onClick={() => removeSelectedToken(tokenDetails)} className={`rounded-full cursor-pointer bg-red-500 p-[1px] pb-[2px] leading-none px-[4px]`}>x</span>
                            </div>
                        )
                    })}
                </div>

                <div className={` space-x-2 items-center w-full space-y-2 mt-8`}>
                    <button className={`button w-full`} onClick={() => mintSelectedTokens(tokensForMint, selectedTokens[0]?.type)}>Mint Land</button>
                    <button className={`text-red-400 underline`} onClick={() => resetSelectedTokens()}>Reset Selection</button>
                </div>
            </div>
        </div>
    )
}
export default MintTokensWidget;

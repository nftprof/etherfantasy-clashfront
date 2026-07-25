import 'tailwindcss/tailwind.css';
import React, {useEffect, useState} from 'react'

/**
 * Welcome Screen Widget
 * @param balance
 * @param onCallback
 * @constructor
 */
function WelcomeScreenWidget({ balance, onCallback }) {
    return (
        <div className={`group max-w-[550px] flex flex-col items-center space-y-4 text-center  w-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-haiti-400/90 rounded-2xl p-16`}>
            <img src="/brand-vertical@2x.png" className={`max-w-[200px]`} alt=""/>
            <p>Welcome to the Cryptoverse, enter the experience below in order to take part in the minting process.</p>

            {balance && balance.hasBalance ?
                <span className={`button cursor-pointer group-hover:scale-[0.95]`} onClick={() => onCallback(true)}>Enter Experience</span>
                :
                <div className={`border-torch-red border-solid border-2 p-4 bg-torch-red/10 text-white shadow-2xl shadow-torch-red/10 rounded-lg`}>It looks as though you don't currently have any Global Claim Tokens in order to mint your land</div>
            }
        </div>
    )
}
export default WelcomeScreenWidget;

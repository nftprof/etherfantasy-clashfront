import 'tailwindcss/tailwind.css';
import React, {useEffect, useState} from 'react'

/**
 * Token Map
 */
export const tokenMap = {
    Epic: 'bg-yellow-400/10 border-2 border-solid border-yellow-400',
    Giant: 'bg-gray-400/10 border-2 border-solid border-gray-400',
    Large: 'bg-bronze-400/10 border-2 border-solid border-bronze-400',
    Medium: 'bg-blue-400/10 border-2 border-solid border-blue-400',
    Small: 'bg-pink-400/10 border-2 border-solid border-pink-400',
    Single: 'bg-teal-400/10 border-2 border-solid border-teal-400'
}

/**
 * Token Map Full Color
 */
export const tokenMapFullColor = {
    Epic: 'bg-yellow-400/100 border-2 border-solid border-yellow-400',
    Giant: 'bg-gray-400/100 border-2 border-solid border-gray-400',
    Large: 'bg-bronze-400/100 border-2 border-solid border-bronze-400',
    Medium: 'bg-blue-400/100 border-2 border-solid border-blue-400',
    Small: 'bg-pink-400/100 border-2 border-solid border-pink-400',
    Single: 'bg-teal-400/100 border-2 border-solid border-teal-400'
}

/**
 * Land Selector Component
 * @constructor
 */
function UserActiveTokenList({ balance }) {
    /**
     * Tokens
     * @param image
     * @param title
     * @param quantity
     * @constructor
     */
    const Token = ({ image, title, quantity }) => {
        return (
            <div className={`${Number(quantity) === 0 && `opacity-75`} text-white font-body flex space-x-1 items-center p-1 px-3 text-xs rounded-full ${tokenMap[title]}`}>
                <div className={`flex-shrink-0`}>{title}</div>
                <div className={`flex flex-col`}><span>{quantity}</span></div>
            </div>
        )
    }

    return (
       <>
           <div className={`flex items-center max-w-[430px] [ md:max-w-[850px] scale-[0.75] [ md:scale-[1] ] origin-right space-x-2 z-[200] overflow-scroll disable-scrollbars`}>
               {balance.map((item, key) => {
                   return (
                       <React.Fragment key={key}>
                           <Token
                               title={item.name}
                               quantity={Number(item?.value)?.toFixed(0)}
                               image={item?.tokenImage}
                           />
                       </React.Fragment>
                   )
               })}
           </div>
       </>
    )
}
export default UserActiveTokenList

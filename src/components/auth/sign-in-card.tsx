'use client'

import { SignIn, useSignIn } from '@clerk/nextjs'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

export function SignInCard() {
    const { isLoaded, signIn } = useSignIn()
    const router = useRouter()
    const pathname = usePathname()

    useEffect(() => {
        if (!isLoaded || !signIn) return

        const status = String(signIn.status ?? '')
        const firstFactorStatus = signIn.firstFactorVerification?.status
        const isOnFactorTwo = pathname?.includes('/factor-two')
        const needsSecondFactor =
            status === 'needs_second_factor' ||
            (status === 'needs_client_trust' && firstFactorStatus === 'verified')
        const needsFirstFactor =
            status === '' ||
            status === 'abandoned' ||
            status === 'needs_identifier' ||
            status === 'needs_first_factor'

        // Mantener ruta sincronizada con el estado real del flujo de Clerk.
        if (needsSecondFactor && !isOnFactorTwo) {
            router.replace('/sign-in/factor-two')
            return
        }

        if (needsFirstFactor && isOnFactorTwo) {
            router.replace('/sign-in')
        }
    }, [isLoaded, pathname, router, signIn])

    return (
        <div className="w-full flex flex-col items-center">
            <SignIn
                routing="path"
                path="/sign-in"
                signUpUrl="/sign-up"
                fallbackRedirectUrl="/dashboard"
            />
        </div>
    )
}

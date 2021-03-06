import { FunctionComponent, VNode } from "preact";
import { ToggleSwitch, Slider, TooltipButton, ExpansionContainer, ExpansionGroup, ContainerItem, ContainerBox, Button } from "../controls"
import styles from "./generate.module.scss"
import { random, classNames, nullOrUndefined } from "../utils"
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { Rust } from "../interface"
import { useNotifier } from "../notification";
import { Icon } from "../icons";
import { NavigationFinished, RouteEvent, useRouter } from "../router";
import { filter } from "rxjs";

const Spacer: FunctionComponent = () => <span class={styles.spacer}></span>

const Word: FunctionComponent<{ idx: number }> = ({ idx, children }) => {
    // const [delay, _] = useState(random(0, 300));
    const [animating, setAnimating] = useState(true);

    const props = {
        animating: '' ? animating : null
    }
    return <span 
        {...props}
        onAnimationEnd={() => setAnimating(false)}
        className={styles.word} 
        style={{ animationDelay: `${idx * 50}ms` }}>
        {children}
    </span>
}

export interface PasswordForm {
    characters: boolean,
    digits: boolean,
    punctuation: boolean,
    special: boolean,
    length: number
}

const PasswordSettings: FunctionComponent<{
    data?: PasswordForm,
    onChange: (data: PasswordForm) => void
}> = ({ onChange, data }) => {
    const [characters, setCharacters] = useState(data?.characters ?? true);
    const [digits, setDigits] = useState(data?.digits  ?? true);
    const [punctuation, setPunctuation] = useState(data?.punctuation ?? true);
    const [special, setSpecial] = useState(data?.special ?? false);

    const [length, setLength] = useState(data?.length ?? 48);

    useEffect(() => {
        onChange({
            characters, digits, punctuation, special, length
        });
    }, [characters, digits, punctuation, special, length])

    const arrayState = [characters, digits, punctuation, special];
    let lod = [false, false, false, false];  // lastOneDisabled
    if (arrayState.filter(s => s).length === 1) {
        lod = arrayState;
    }

    // disabled={lod[0]} checked={characters} onChanged={setCharacters}
    return (
        <>
            <ContainerItem label="Characters" children={<ToggleSwitch disabled={lod[0]} checked={characters} onChanged={setCharacters}/>}/>
            <ContainerItem label="Numbers" children={<ToggleSwitch disabled={lod[1]} checked={digits} onChanged={setDigits}/>}/>
            <ContainerItem label="Punctuation" children={<ToggleSwitch disabled={lod[2]} checked={punctuation} onChanged={setPunctuation}/>}/>
            <ContainerItem label="Special Punctuation" children={<ToggleSwitch disabled={lod[3]} checked={special} onChanged={setSpecial}/>}/>
            <ContainerItem label="Length" children={<Slider min={8} max={88} value={length} onChange={setLength}/>}/>
        </>
    )
}

const POOL_SIZE_MAPPING: { [key: string]: number } = ({
    characters: 52,
    digits: 9,
    punctuation: 22,
    special: 14,
}) as any;

function calculatePasswordEntropy(config: PasswordForm) {
    let poolSize = Object.entries(config).filter(([key, value]) => value && key !== 'length').map(([key, _]) => key)
        .map(name => POOL_SIZE_MAPPING[name]).reduce((prev, curr) => prev + curr);
    return config.length * Math.log2(poolSize);
}

const colorMapping = {
    1: '#008035',
    0.75: '#30bf30',
    0.5: '#ffd500',
    0.25: '#ff2a00',
    0: ''
}

const PasswordOutput: FunctionComponent<{
    password: string | null,
    entropy: number
}> = ({ password, entropy }) => {
    const [fadeR, setFadeR] = useState(false);
    const [fadeL, setFadeL] = useState(false);
    const [scale, setScale] = useState<0 | 0.25 | 0.5 | 0.75 | 1>(null!);
    const [contentElement, setElement] = useState<HTMLSpanElement | null>(null!);

    useEffect(() => {
        if (!password) return;
        checkScroll();
    }, [password, contentElement]);

    useEffect(() => {
        // very good 210
        // good 158
        // medium 100
        // bad 50

        if (entropy >= 210)
            setScale(1)
        else if (entropy >= 158)
            setScale(0.75)
        else if (entropy >= 100)
            setScale(0.5)
        else if (entropy >= 50)
            setScale(0.25)
        else
            setScale(0)
    }, [entropy])

    const checkScroll = () => {
        if (nullOrUndefined(contentElement)) {
            return;
        }
        const element = contentElement!;
        if (element.scrollWidth > element.offsetWidth) {
            let value = true;
            console.log(element.scrollWidth - element.scrollLeft)
            if (element.scrollWidth - element.scrollLeft === 730) {
                value = false;
            }
            setFadeR(value);
        } else {
            setFadeR(false);
        }
        setFadeL(element.scrollLeft > 0);
    }

    return (
        <ContainerBox class={classNames({
            [styles['password-box']]: true,
            [styles['fade-r']]: fadeR,
            [styles['fade-l']]: fadeL,
        })}>
            <span ref={setElement} class={styles.content} onScroll={() => checkScroll()}>
                { password }
            </span>
            <span 
                style={{ transform: `scaleX(${scale})`, backgroundColor: colorMapping[scale] }} 
                class={styles['strength-indicator']}/>
        </ContainerBox>
    );
}

export const GeneratePage: FunctionComponent<{ config: PasswordForm }> = ({
    config: initialConfig 
}) => {
    const [initialized, setInitialzed] = useState(0);
    const [wordlist, setWordlist] = useState<string[]>(null!);
    const [password, setPassword] = useState<string>(null!);
    const [config, setConfig] = useState(initialConfig);
    const [animating, setAnimating] = useState(false);

    const router = useRouter()!;
    const notfiy = useNotifier();

    useEffect(() => {
        const subscribtion = router.events.pipe(
            filter((e: RouteEvent): e is NavigationFinished => e instanceof NavigationFinished)
        ).subscribe({
            next() {
                setInitialzed(1);
                setTimeout(() => subscribtion.unsubscribe(), 0);
            }
        })
    }, [])

    useEffect(() => {
        if (initialized !== 1) return;
        Rust.generateMnemonicPhrase(initialConfig).then(data => {
            setWordlist(data.phrase);
            setPassword(data.password);
            setInitialzed(2);
        }).catch(e => notfiy({
            class: 'error',
            closeButton: true,
            title: 'IPC command error',
            content: `Error sending IPC request:
            ${e}
            `
        }));
    }, [initialized]);

    useEffect(() => {
        if (initialized !== 2) return;
        Rust.fromMnemonicPhrase(wordlist, config).then(data => {
            setPassword(data.password);
        }).catch(console.error);
    }, [config, initialized]);

    useEffect(() => {
        if (animating) {
            setTimeout(() => setAnimating(false), 800);
        }
    }, [animating])

    const words = useMemo<VNode[] | null>(() => (
        wordlist ?  wordlist.map((w, i) => <Word idx={i} key={`${w}-${i}`}>{w}</Word>) : null
    ), [wordlist])

    const animationHandler = () => {
        if (!animating) setAnimating(true);
    }

    const updatePhrase = () => Rust.generateMnemonicPhrase(config).then(config => {
        setWordlist(config.phrase);
        setPassword(config.password);
    })
    
    const copyPassword = () => {
        navigator.clipboard.writeText(password);
    }

    return (
        <div class={styles['generate-grid']}>
            <ExpansionGroup>
                <ExpansionContainer 
                    buttons={[
                        { icon: 'printer', onClick: () => {} },
                        { icon: 'update', onClick: updatePhrase }
                    ]}
                    heading="Mnemonic Phrase" expanded>
                    <ContainerBox>
                    <div
                        onAnimationStart={animationHandler} 
                        className={classNames({ 
                            [styles['word-container']]: true,
                            [styles['animating']]: animating
                        })}>
                        { words }
                    </div>
                    </ContainerBox>
                </ExpansionContainer>
                <ExpansionContainer heading="Password Settings">
                    <PasswordSettings data={config} onChange={setConfig}/>
                </ExpansionContainer>
                <ExpansionContainer
                    buttons={[
                        { icon: 'copy', onClick: copyPassword }
                    ]}
                    heading="Password" expanded>
                    <PasswordOutput password={password} entropy={calculatePasswordEntropy(config)}/>
                </ExpansionContainer>
            </ExpansionGroup>
        </div>
    );
};

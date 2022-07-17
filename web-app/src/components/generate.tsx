import { FunctionComponent } from "preact";
import { ToggleSwitch, Slider, TooltipButton } from "../controls"
import styles from "./generate.module.scss"
import { random, classNames } from "../utils"
import { useEffect, useRef, useState } from "preact/hooks";
import { Rust } from "../interface"
import { useNotifier } from "../notification";
import { Icon } from "../icons";
import { NavigationFinished, RouteEvent, useRouter } from "../router";
import { filter } from "rxjs";

const Spacer: FunctionComponent = () => <span class={styles.spacer}></span>

const Word: FunctionComponent = ({ children }) => {
    const [delay, _] = useState(random(0, 300));
    return <span 
        className={styles.word} 
        style={{ animationDelay: `${delay}ms` }}>
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

    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h4>Password Settings</h4>
                <ToggleSwitch disabled={lod[0]} checked={characters} onChanged={setCharacters}>Characters</ToggleSwitch>
                <ToggleSwitch disabled={lod[1]} checked={digits} onChanged={setDigits}>Numbers</ToggleSwitch>
                <ToggleSwitch disabled={lod[2]} checked={punctuation} onChanged={setPunctuation}>Punctuation</ToggleSwitch>
                <ToggleSwitch disabled={lod[3]} checked={special} onChanged={setSpecial}>Special Punctuation</ToggleSwitch>
                
            </div>
            <div style={{ display: 'flex', alignItems: 'center' }}>
                <div>
                    <span class={styles['length-indicator']} >{length}</span>
                    <Slider value={length} onChange={setLength} min={8} max={88}/>
                </div>
            </div>
        </>
    )
}

function openPrinter(content: string) {
    const hiddenContainer = document.createElement('div');
    hiddenContainer.style.display = 'none';
    document.body.appendChild(hiddenContainer);

    const frame = document.createElement('iframe');
    hiddenContainer.appendChild(frame);

    const printWindow = frame.contentWindow;
    if (printWindow === null)
        throw Error("Can't open printer");
    
    printWindow.document.write(
        '<code>',
        content,
        '</code>'
    );

    printWindow.print();

    hiddenContainer.remove();
}

const ActionSidebar: FunctionComponent<{
    onCopy?: () => Promise<void>,
    onRegen?: () => Promise<void>,
    onPrint?: () => string
}> = ({ onCopy, onRegen, onPrint }) => {
    const notfiy = useNotifier();

    const printHandler = () => {
        if (!onPrint) return;
        const close = notfiy({
            class: 'info',
            closeButton: false,
            title: 'Preparing to print ...',
            content: 'Generating print document'
        });
        setTimeout(() => {
            try {
                openPrinter(onPrint());
            } catch (e: any) {
                close();
                notfiy({
                    class: 'error',
                    closeButton: true,
                    title: 'Error opening printer',
                    content: e.toString()
                });
            }
            close();
        })
    }

    const updateHandler = () => {
        if (!onRegen) return;
        onRegen();
    }

    const copyHandler = () => {
        if (!onCopy) return;
        onCopy()
            .then(() => notfiy({
                class: 'success',
                closeButton: false, 
                title: 'Copied successfully!'
            }))
            .catch(e => notfiy({
                class: 'error',
                closeButton: true,
                title: 'Clipboard error',
                content: e.toString()
            }));
    }

    return (
        <div class={styles['action-sidebar']}>
            <TooltipButton onClick={copyHandler} tooltip="Copy Password">
                <Icon width={45} name="copy"/>
            </TooltipButton>
            <TooltipButton onClick={updateHandler} tooltip="Generate Phrase">
                <Icon width={45} name="update"/>
            </TooltipButton>
            <TooltipButton onClick={printHandler} tooltip="Print Mnemonic">
                <Icon width={45} name="printer"/>
            </TooltipButton>
            <TooltipButton tooltip="Finish and exit">
                <Icon width={45} name="tick"/>
            </TooltipButton>
        </div>
    );
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

const IntelligentPasswordBox: FunctionComponent<{
    password: string | null,
    entropy: number
}> = ({ password, entropy }) => {
    const [fontSize, setSize] = useState(3);
    const [fadeR, setFadeR] = useState(false);
    const [fadeL, setFadeL] = useState(false);
    const [scale, setScale] = useState<0 | 0.25 | 0.5 | 0.75 | 1>(null!);
    const pwdContent = useRef<HTMLSpanElement>(null!);

    useEffect(() => {
        if (!password) return;
        checkScroll();

        if (password.length < 44 || password.length > 50) return;
        const ratio = 1 - ((password.length - 40) / 10);
        setSize((ratio * 0.5) + 2.5);
    }, [password]);

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
        const element = pwdContent.current;
        if (element.scrollWidth > element.offsetWidth) {
            let value = true;
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
        <div 
            id="pwdbox" 
            class={classNames({ 
                [styles['password-box']]: true, 
                [styles['fade-r']]: fadeR, 
                [styles['fade-l']]: fadeL 
            })}>
            <span class={styles.label}>Password:</span>
            <span 
                class={styles.content} 
                onScroll={() => checkScroll()} 
                style={{ fontSize: `${fontSize}rem` }} 
                ref={pwdContent}>
                { password ? password : null }
            </span>
            <span 
                style={{ transform: `scaleX(${scale})`, backgroundColor: colorMapping[scale] }} 
                class={styles['strength-indicator']}/>
        </div>
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
                subscribtion.unsubscribe();
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

    const animationHandler = () => {
        if (!animating) setAnimating(true);
    }

    const updatePhrase = () => Rust.generateMnemonicPhrase(config).then(config => {
        setWordlist(config.phrase);
        setPassword(config.password);
    })
    

    return (
        <div class={styles.container}>
            <h1>Generate</h1>
            <div class={styles['generate-grid']}>
                <div 
                    onAnimationStart={animationHandler} 
                    className={classNames({ 
                        [styles['word-container']]: true,
                        [styles['animating']]: animating
                    })}>
                    { wordlist ?  wordlist.map((w, i) => <Word key={`${w}-${i}`}>{w}</Word>) 
                        .reduce((prev, cur) => <>{prev} <Spacer/> {cur}</>) : null }
                </div>
                <IntelligentPasswordBox password={password} entropy={calculatePasswordEntropy(config)}/>
                <div>
                    <div class={styles['controls-container']}>
                        <PasswordSettings data={config} onChange={setConfig}/>
                        <ActionSidebar
                            onCopy={() => navigator.clipboard.writeText(password)} 
                            onRegen={updatePhrase}
                            onPrint={() => wordlist.join(' - ')}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

import detectEthereumProvider from "@metamask/detect-provider"
import { Strategy, ZkIdentity } from "@zk-kit/identity"
import { generateMerkleProof, Semaphore } from "@zk-kit/protocols"
import { Contract, providers, utils } from "ethers"
import Head from "next/head"
import React, { useState } from "react"
import styles from "../styles/Home.module.css"
import { Box, Button, TextField } from "@mui/material"
import { useForm, SubmitHandler } from "react-hook-form";
import { object, string, number } from 'yup';
import Greeter from "artifacts/contracts/Greeters.sol/Greeters.json"

type Inputs = {
    name: string,
    age: number,
    address: string,
};

const userSchema = object({
    name: string().required(),
    age: number().required().positive().integer(),
    address: string().required(),
});

export default function Home() {
    const [logs, setLogs] = React.useState("Connect your wallet and greet!")
    const { register, handleSubmit, watch, formState: { errors } } = useForm<Inputs>();
    const [greeting, setGreeting] = useState("");
    // on submit we log the JSON data on the console
    const onSubmit: SubmitHandler<Inputs> = data => console.log(JSON.stringify(data));

    async function listenNewGreeting() {
        const provider = new providers.JsonRpcProvider("http://localhost:8545")
        const contract = new Contract("0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", Greeter.abi, provider)

        contract.on("NewGreeting", (res) => {
            setGreeting(utils.parseBytes32String(res))
        })
    }

    async function greet() {
        setLogs("Creating your Semaphore identity...")
        
        // validate user schema
        await userSchema.validate(watch());
      
        const provider = (await detectEthereumProvider()) as any

        await provider.request({ method: "eth_requestAccounts" })

        const ethersProvider = new providers.Web3Provider(provider)
        const signer = ethersProvider.getSigner()
        const message = await signer.signMessage("Sign this message to create your identity!")

        const identity = new ZkIdentity(Strategy.MESSAGE, message)
        const identityCommitment = identity.genIdentityCommitment()
        const identityCommitments = await (await fetch("./identityCommitments.json")).json()

        const merkleProof = generateMerkleProof(20, BigInt(0), identityCommitments, identityCommitment)

        setLogs("Creating your Semaphore proof...")

        const greeting = `Hello ${watch('name')}`

        const witness = Semaphore.genWitness(
            identity.getTrapdoor(),
            identity.getNullifier(),
            merkleProof,
            merkleProof.root,
            greeting
        )

        const { proof, publicSignals } = await Semaphore.genProof(witness, "./semaphore.wasm", "./semaphore_final.zkey")
        const solidityProof = Semaphore.packToSolidityProof(proof)

        const response = await fetch("/api/greet", {
            method: "POST",
            body: JSON.stringify({
                greeting,
                nullifierHash: publicSignals.nullifierHash,
                solidityProof: solidityProof
            })
        })

        if (response.status === 500) {
            const errorMessage = await response.text()

            setLogs(errorMessage)
        } else {
            setLogs("Your anonymous greeting is onchain :)")
        }
    }

    // listen for New Greeting event
    listenNewGreeting()

    return (
        <div className={styles.container}>
            <Head>
                <title>Greetings</title>
                <meta name="description" content="A simple Next.js/Hardhat privacy application with Semaphore." />
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <main className={styles.main}>
                <h1 className={styles.title}>Greetings</h1>

                <p className={styles.description}>A simple Next.js/Hardhat privacy application with Semaphore.</p>

                <div className={styles.logs}>{logs}</div>
                
                <div onClick={() => greet()} className={styles.button}>
                    Greet
                </div>
                <Box component="span" sx={{ p: 2, margin: 2, border: '1px dashed grey' }}>
                    <p>Form that will submit JSON data on the console.</p>
                    <form onSubmit={handleSubmit(onSubmit)} className={styles.description}>
                        {/* Textbox for the name */}
                        <TextField {...register("name")} label="Name" type="string" required/>
                        <p>{errors.name?.message}</p>
                        {/* Textbox for the age */}
                        <TextField {...register("age")} label="Age" type="number" required/>
                        <p>{errors.age?.message}</p>
                        {/* Textbox for the address */}
                        <TextField {...register("address")} label="Address" className={styles.textfield} type="string" required/>
                        <p className={styles.log}>{errors.address?.message}</p>
                        {/* Button submits the form */}
                        <Button type="submit" className={styles.button}>Submit</Button>
                    </form>
                </Box>
                <div>
                    <p className={styles.description}>{greeting}</p>
            </div>
            </main>
        </div>
    )
}

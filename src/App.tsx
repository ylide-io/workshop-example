import React, { PureComponent } from 'react';
import { observer } from 'mobx-react';
import { ethereumWalletFactory, evmFactories, EVMNetwork, EVM_CHAINS, EVM_NAMES } from '@ylide/ethereum';
import {
	AbstractBlockchainController,
	AbstractWalletController,
	BrowserIframeStorage,
	BrowserLocalStorage,
	IGenericAccount,
	IMessage,
	MessageContentV3,
	PublicKeyType,
	ServiceCode,
	SourceReadingSession,
	Ylide,
	YlideKey,
	YlideKeyPair,
	YlideKeyStore,
} from '@ylide/sdk';
import { makeObservable, observable } from 'mobx';

Ylide.registerBlockchainFactory(evmFactories[EVMNetwork.LOCAL_HARDHAT]);
Ylide.registerWalletFactory(ethereumWalletFactory);

@observer
class App extends PureComponent {
	storage = new BrowserLocalStorage();
	keystore = new YlideKeyStore(this.storage, {
		onPasswordRequest: this.handlePasswordRequest.bind(this),
		onDeriveRequest: this.handleDeriveRequest.bind(this),
	});
	ylide = new Ylide(this.keystore);
	blockchain!: AbstractBlockchainController;
	wallet!: AbstractWalletController;

	@observable localKey: YlideKey | null = null;

	@observable account: IGenericAccount | null = null;
	@observable remoteKey: Uint8Array | null = null;

	@observable recipientAddress: string = '';

	@observable subject: string = '';
	@observable text: string = '';

	@observable messages: IMessage[] = [];

	constructor(props: any) {
		super(props);

		makeObservable(this);
	}

	async componentDidMount() {
		// @ts-ignore
		window.app = this;
		this.blockchain = await this.ylide.addBlockchain(EVM_NAMES[EVMNetwork.LOCAL_HARDHAT]);
		this.wallet = await this.ylide.addWallet(
			evmFactories[EVMNetwork.LOCAL_HARDHAT].blockchainGroup,
			ethereumWalletFactory.wallet,
			{
				onSwitchAccountRequest: async (
					walletName: string,
					currentAccount: IGenericAccount | null,
					needAccount: IGenericAccount,
				) => {
					console.log('onSwitchAccountRequest: ', walletName, currentAccount, needAccount);
				},
				onNetworkSwitchRequest: async (
					reason: string,
					currentNetwork: EVMNetwork | undefined,
					needNetwork: EVMNetwork,
					needChainId: number,
				) => {
					console.log('onNetworkSwitchRequest: ', reason, currentNetwork, needNetwork, needChainId);
				},
			},
		);

		await this.keystore.load();
	}

	async handlePasswordRequest(reason: string): Promise<string | null> {
		return new Promise<string | null>(async (resolve, reject) => {
			// const result = prompt('type');
			// resolve(result ? result : null);
			return null;
		});
	}

	async handleDeriveRequest(
		reason: string,
		blockchainGroup: string,
		walletName: string,
		address: string,
		magicString: string,
	): Promise<Uint8Array | null> {
		try {
			return this.wallet.signMagicString(this.account!, magicString);
		} catch (err) {
			console.error('err: ', err);
			return null;
		}
		// try {
		// 	const wallet = this.wallets.find(w => w.factory.wallet === walletName);
		// 	if (!wallet) {
		// 		return null;
		// 	}
		// 	return wallet.controller.signMagicString(
		// 		{
		// 			address,
		// 			blockchain: blockchainGroup,
		// 			publicKey: null,
		// 		},
		// 		magicString,
		// 	);
		// } catch (err) {
		// 	return null;
		// }
	}

	async authorizeMe() {
		this.account = await this.wallet.requestAuthentication();

		const foundKey = this.keystore.keys.find(k => k.address === this.account!.address);
		if (!foundKey) {
			console.log('Key not found for account: ', this.account?.address);
			return;
		}

		this.localKey = foundKey;

		console.log('this.localKey: ', this.localKey);
	}

	async getRemoteKey() {
		const publicKey = await this.blockchain.extractPublicKeyFromAddress(this.account!.address);
		console.log('publicKey: ', publicKey);
		if (publicKey && publicKey.type === PublicKeyType.YLIDE) {
			this.remoteKey = publicKey.bytes;
			console.log('Key is found!');
		}
	}

	async registerUserKey() {
		const password = prompt('Please, enter your Ylide password:', '');
		if (!password) {
			return;
		}
		const key = await this.keystore.create(
			'Register new user',
			evmFactories[EVMNetwork.LOCAL_HARDHAT].blockchainGroup,
			ethereumWalletFactory.wallet,
			this.account!.address,
			password,
		);
		await key.storeUnencrypted(password);
		await this.keystore.save();
		// try {
		// 	await this.wallet.attachPublicKey(this.account!, key.publicKey, {
		// 		network: EVMNetwork.LOCAL_HARDHAT,
		// 	});
		// } catch (err) {
		// 	console.error('err: ', err);
		// }
	}

	async sendMessage() {
		const content = MessageContentV3.plain(this.subject, this.text);

		const recipients = [this.recipientAddress];

		const msgId = await this.ylide.sendMessage(
			{
				wallet: this.wallet,
				sender: this.account!,
				content,
				recipients,
				serviceCode: ServiceCode.NONE,
				copyOfSent: true,
			},
			{
				network: EVMNetwork.LOCAL_HARDHAT,
			},
		);

		console.log('Message successfully sent: ', msgId);

		// await .ylide.sendMessage(
		// 	{
		// 		wallet,
		// 		sender: account,
		// 		content,
		// 		recipients: ['address'],
		// 		serviceCode: ServiceCode.MAIL,
		// 	},
		// 	{
		// 		network: EVMNetwork.LOCAL_HARDHAT,
		// 	},
		// );
	}

	// fb4fd3aedfe26098ed5e5159390c5e7d3e402e86c2306c0d5cc83e11afa58edd

	async readMessages() {
		const recipient = this.wallet.addressToUint256(this.account!.address);
		const messages = await this.blockchain.retrieveMessageHistoryByBounds(null, recipient);

		this.messages = messages;
		console.log('messages: ', messages);
	}

	async readMessageContent(msg: IMessage) {
		const content = await this.blockchain.retrieveAndVerifyMessageContent(msg);

		console.log('content: ', content);

		if (!content || content.corrupted) {
			console.log('Content is corrupted');
			return;
		}

		const decrypted = await this.ylide.decryptMessageContent(this.account!, msg, content);

		console.log('decrypted: ', decrypted);
	}

	render() {
		return (
			<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
				<h1>
					<a style={{ fontSize: 24 }} href="https://docs.ylide.io/">
						https://docs.ylide.io/
					</a>
				</h1>
				<div style={{ background: 'rgba(255, 0, 0, 0.1)' }}>
					<h3>Key creation & signing up</h3>
					<br />
					<br />
					{this.account ? (
						<div>
							Connected account address: {this.account.address}
							<br />
							<br />
						</div>
					) : null}
					<button onClick={this.authorizeMe.bind(this)}>Get account!</button>
					<br />
					<br />
					My remote public key:{' '}
					{this.remoteKey ? (
						'Key is registered'
					) : (
						<div>
							Key is not registered
							<br />
							<br />
							<button onClick={this.registerUserKey.bind(this)}>Create and register the key!</button>
						</div>
					)}
					{this.localKey ? 'Local key is found too' : 'Local key was not found'}
					<br />
					<br />
					<button onClick={this.getRemoteKey.bind(this)}>Get remote key!</button>
					<br />
					<br />
				</div>
				<div style={{ background: 'rgba(0, 255, 0, 0.1)' }}>
					<h3>Sending messages</h3>
					<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: 400 }}>
						<div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
							<div style={{ flexBasis: 100 }}>To:</div>
							<div style={{ flexGrow: 1 }}>
								<input
									value={this.recipientAddress}
									onChange={e => (this.recipientAddress = e.target.value)}
									placeholder="Address is here"
								/>
							</div>
						</div>
						<div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
							<div style={{ flexBasis: 100 }}>Subject:</div>
							<div style={{ flexGrow: 1 }}>
								<input
									value={this.subject}
									onChange={e => (this.subject = e.target.value)}
									placeholder="Subject is here"
								/>
							</div>
						</div>
						<div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
							<div style={{ flexBasis: 100 }}>Text:</div>
							<div style={{ flexGrow: 1 }}>
								<textarea
									value={this.text}
									onChange={e => (this.text = e.target.value)}
									placeholder="Text is here"
								/>
							</div>
						</div>
						<div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center' }}>
							<button onClick={this.sendMessage.bind(this)}>Send!</button>
						</div>
					</div>
				</div>
				<div style={{ background: 'rgba(0, 0, 255, 0.1)' }}>
					<h3>Reading messages</h3>
					<button onClick={this.readMessages.bind(this)}>Read messages</button>
					{this.messages.map(m => (
						<div key={m.msgId}>
							{m.msgId}
							<button onClick={() => this.readMessageContent(m)}>Read message content</button>
						</div>
					))}
				</div>
			</div>
		);
	}
}

export default App;

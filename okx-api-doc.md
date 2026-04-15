Overview
Welcome to our API documentation. OKX provides REST and WebSocket APIs to suit your trading needs.

 Important - OKX API Agreement: continued use constitutes acceptance

We encourage you to review the OKX API Agreement in full before continuing to use the API Services. Your continued use of any OKX API Services following the date of this notice constitutes your acceptance of the Agreement in full.
If you do not agree to the Agreement, you must immediately cease all use of the OKX API Services, including disconnecting any active API integrations, Agent Trade Kit connections, and automated systems that access OKX via APIs.
API Resources and Support
Tutorials
Learn how to trade with API: Best practice to OKX’s API
Learn python spot trading step by step: Python Spot Trading Tutorial
Learn python derivatives trading step by step: Python Derivatives Trading Tutorial


Python libraries
Use Python SDK for easier integration: Python SDK
Get access to our market maker python sample code Python market maker sample


Customer service
Please take 1 minute to help us improve: API Satisfaction Survey
If you have any API-related inquiries, you can reach out to us by scanning the code below via the OKX APP.
API Technical Support QR Code

API key Creation
Please refer to my api page regarding API Key creation.

Generating an API key
Create an API key on the website before signing any requests. After creating an API key, keep the following information safe:

API key
Secret key
Passphrase
The system returns randomly-generated API keys and SecretKeys. You will need to provide the Passphrase to access the API. We store the salted hash of your Passphrase for authentication. We cannot recover the Passphrase if you have lost it. You will need to create a new set of API key.


API key permissions
There are three permissions below that can be associated with an API key. One or more permission can be assigned to any key.

Read : Can request and view account info such as bills and order history which need read permission
Trade : Can place and cancel orders, funding transfer, make settings which need write permission
Withdraw : Can make withdrawals
API key security
 To improve security, we strongly recommend clients linked the API key to IP addresses
Each API key can bind up to 20 IP addresses, which support IPv4/IPv6 and network segment formats.
 API keys that are not linked to an IP address and have `trade` or `withdraw` permissions will expire after 14 days of inactivity. (The API key of demo trading will not expire)
Only when the user calls an API that requires API key authentication will it be considered as the API key is used.
Calling an API that does not require API key authentication will not be considered used even if API key information is passed in.
For websocket, only operation of logging in will be considered to have used the API key. Any operation though the connection after logging in (such as subscribing/placing an order) will not be considered to have used the API key. Please pay attention.
Users can get the usage records of the API key with trade or withdraw permissions but unlinked to any IP address though Security Center.

REST Authentication
Making Requests
All private REST requests must contain the following headers:

OK-ACCESS-KEY The API key as a String.

OK-ACCESS-SIGN The Base64-encoded signature (see Signing Messages subsection for details).

OK-ACCESS-TIMESTAMP Request timestamp in ISO 8601 UTC format with millisecond precision, e.g. 2020-12-08T09:08:57.715Z. The server rejects requests where this differs from server time by more than 30 seconds (error 50102). Always use UTC — local timezone offset is the most common cause of error 50102. Synchronise with GET /api/v5/public/time before placing orders.

OK-ACCESS-PASSPHRASE The passphrase you specified when creating the API key.

Request bodies should have content type application/json and be in valid JSON format.

Signature
Signing Messages

The OK-ACCESS-SIGN header is generated as follows:

Create a pre-hash string of timestamp + method + requestPath + body (where + represents String concatenation).
Prepare the SecretKey.
Sign the pre-hash string with the SecretKey using the HMAC SHA256.
Encode the signature in the Base64 format.
Example: sign=CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA256(timestamp + 'GET' + '/api/v5/account/balance?ccy=BTC', SecretKey))

The timestamp value is the same as the OK-ACCESS-TIMESTAMP header with millisecond ISO format, e.g. 2020-12-08T09:08:57.715Z.

The request method should be in UPPERCASE: e.g. GET and POST.

The requestPath is the path of requesting an endpoint.

Example: /api/v5/account/balance

The body refers to the String of the request body. It can be omitted if there is no request body (frequently the case for GET requests).

Example: {"instId":"BTC-USDT","lever":"5","mgnMode":"isolated"}

 `GET` request parameters are counted as requestpath, not body
The SecretKey is generated when you create an API key.

Example: 22582BD0CFF14C41EDBF1AB98506286D

WebSocket
Overview
WebSocket is a new HTML5 protocol that achieves full-duplex data transmission between the client and server, allowing data to be transferred effectively in both directions. A connection between the client and server can be established with just one handshake. The server will then be able to push data to the client according to preset rules. Its advantages include:

The WebSocket request header size for data transmission between client and server is only 2 bytes.
Either the client or server can initiate data transmission.
There's no need to repeatedly create and delete TCP connections, saving resources on bandwidth and server.
 We recommend developers use WebSocket API to retrieve market data and order book depth.
Connect
Connection limit: 3 requests per second (based on IP)

When subscribing to a public channel, use the address of the public service. When subscribing to a private channel, use the address of the private service

Request limit:

The total number of 'subscribe'/'unsubscribe'/'login' requests per connection is limited to 480 times per hour.

If there’s a network problem, the system will automatically disable the connection.

The connection will break automatically if the subscription is not established or data has not been pushed for more than 30 seconds.

To keep the connection stable:

1. Set a timer of N seconds whenever a response message is received, where N is less than 30.

2. If the timer is triggered, which means that no new message is received within N seconds, send the String 'ping'.

3. Expect a 'pong' as a response. If the response message is not received within N seconds, please raise an error or reconnect.

Connection count limit
The limit will be set at 30 WebSocket connections per specific WebSocket channel per sub-account. Each WebSocket connection is identified by the unique connId.



The WebSocket channels subject to this limitation are as follows:

Orders channel
Account channel
Positions channel
Balance and positions channel
Position risk warning channel
Account greeks channel
If users subscribe to the same channel through the same WebSocket connection through multiple arguments, for example, by using {"channel": "orders", "instType": "ANY"} and {"channel": "orders", "instType": "SWAP"}, it will be counted once only. If users subscribe to the listed channels (such as orders and accounts) using either the same or different connections, it will not affect the counting, as these are considered as two different channels. The system calculates the number of WebSocket connections per channel.



The platform will send the number of active connections to clients through the channel-conn-count event message to new channel subscriptions.

Connection count update

{
    "event":"channel-conn-count",
    "channel":"orders",
    "connCount": "2",
    "connId":"abcd1234"
}



When the limit is breached, generally the latest connection that sends the subscription request will be rejected. Client will receive the usual subscription acknowledgement followed by the channel-conn-count-error from the connection that the subscription has been terminated. In exceptional circumstances the platform may unsubscribe existing connections.

Connection limit error

{
    "event": "channel-conn-count-error",
    "channel": "orders",
    "connCount": "30",
    "connId":"a4d3ae55"
}



Order operations through WebSocket, including place, amend and cancel orders, are not impacted through this change.

Login
Request Example

{
  "op": "login",
  "args": [
    {
      "apiKey": "******",
      "passphrase": "******",
      "timestamp": "1538054050",
      "sign": "7L+zFQ+CEgGu5rzCj4+BdV2/uUHGqddA9pI6ztsRRPs="
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
op	String	Yes	Operation
login
args	Array of objects	Yes	List of account to login
> apiKey	String	Yes	API Key
> passphrase	String	Yes	API Key password
> timestamp	String	Yes	Unix Epoch time, the unit is seconds
> sign	String	Yes	Signature string
Successful Response Example

{
  "event": "login",
  "code": "0",
  "msg": "",
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "event": "error",
  "code": "60009",
  "msg": "Login failed.",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
event	String	Yes	Operation
login
error
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
apiKey: Unique identification for invoking API. Requires user to apply one manually.

passphrase: API Key password

timestamp: the Unix Epoch time, the unit is seconds, e.g. 1704876947

sign: signature string, the signature algorithm is as follows:

First concatenate timestamp, method, requestPath, strings, then use HMAC SHA256 method to encrypt the concatenated string with SecretKey, and then perform Base64 encoding.

secretKey: The security key generated when the user applies for API key, e.g. 22582BD0CFF14C41EDBF1AB98506286D

Example of timestamp: const timestamp = '' + Date.now() / 1,000

Among sign example: sign=CryptoJS.enc.Base64.stringify(CryptoJS.HmacSHA256(timestamp +'GET'+'/users/self/verify', secretKey))

method: always 'GET'.

requestPath : always '/users/self/verify'

 The request will expire 30 seconds after the timestamp. If your server time differs from the API server time, we recommended using the REST API to query the API server time and then set the timestamp.
Subscribe
Subscription Instructions

Request format description

{
  "id": "1512",
  "op": "subscribe",
  "args": ["<SubscriptionTopic>"]
}
WebSocket channels are divided into two categories: public and private channels.

Public channels -- No authentication is required, include tickers channel, K-Line channel, limit price channel, order book channel, and mark price channel etc.

Private channels -- including account channel, order channel, and position channel, etc -- require log in.

Users can choose to subscribe to one or more channels, and the total length of multiple channels cannot exceed 64 KB.

Below is an example of subscription parameters. The requirement of subscription parameters for each channel is different. For details please refer to the specification of each channels.

Request Example

{
    "id": "1512",
    "op":"subscribe",
    "args":[
        {
            "channel":"tickers",
            "instId":"BTC-USDT"
        }
    ]
}
Request parameters

Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
> instType	String	No	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
ANY
> instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
> instId	String	No	Instrument ID
Response Example

{
    "id": "1512",
    "event": "subscribe",
    "arg": {
        "channel": "tickers",
        "instId": "BTC-USDT"
    },
    "connId": "accb8e21"
}
Return parameters

Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instType	String	No	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
ANY
> instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
> instId	String	No	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Unsubscribe
Unsubscribe from one or more channels.

Request format description

{
  "op": "unsubscribe",
  "args": ["< SubscriptionTopic> "]
}
Request Example

{
  "op": "unsubscribe",
  "args": [
    {
      "channel": "tickers",
      "instId": "BTC-USDT"
    }
  ]
}
Request parameters

Parameter	Type	Required	Description
op	String	Yes	Operation
unsubscribe
args	Array of objects	Yes	List of channels to unsubscribe from
> channel	String	Yes	Channel name
> instType	String	No	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
ANY
> instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
> instId	String	No	Instrument ID
Response Example

{
    "event": "unsubscribe",
    "arg": {
        "channel": "tickers",
        "instId": "BTC-USDT"
    },
    "connId": "d0b44253"
}
Response parameters

Parameter	Type	Required	Description
event	String	Yes	Event
unsubscribe
error
arg	Object	No	Unsubscribed channel
> channel	String	Yes	Channel name
> instType	String	No	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
> instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
> instId	String	No	Instrument ID
code	String	No	Error code
msg	String	No	Error message
Notification
WebSocket has introduced a new message type (event = notice).


Client will receive the information in the following scenarios:

Websocket disconnect for service upgrade
60 seconds prior to the upgrade of the WebSocket service, the notification message will be sent to users indicating that the connection will soon be disconnected. Users are encouraged to establish a new connection to prevent any disruptions caused by disconnection.

Response Example

{
    "event": "notice",
    "code": "64008",
    "msg": "The connection will soon be closed for a service upgrade. Please reconnect.",
    "connId": "a4d3ae55"
}


The feature is supported by WebSocket Public (/ws/v5/public) and Private (/ws/v5/private) for now.

Account mode
To facilitate your trading experience, please set the appropriate account mode before starting trading.

In the trading account trading system, 4 account modes are supported: Spot mode, Futures mode, Multi-currency margin mode, and Portfolio margin mode.

You need to set on the Web/App for the first set of every account mode.

Production Trading Services
The Production Trading URL:

REST: https://eea.okx.com
Public WebSocket: wss://wseea.okx.com:8443/ws/v5/public
Private WebSocket: wss://wseea.okx.com:8443/ws/v5/private
Business WebSocket: wss://wseea.okx.com:8443/ws/v5/business
Demo Trading Services
Currently, the API works for Demo Trading, but some functions are not supported, such as withdraw,deposit,purchase/redemption, etc.

The Demo Trading URL:

REST: https://eea.okx.com
Public WebSocket: wss://wseeapap.okx.com:8443/ws/v5/public
Private WebSocket: wss://wseeapap.okx.com:8443/ws/v5/private
Business WebSocket: wss://wseeapap.okx.com:8443/ws/v5/business
OKX account can be used for login on Demo Trading. If you already have an OKX account, you can log in directly.

Start API Demo Trading by the following steps:
Login OKX —> Trade —> Demo Trading —> Personal Center —> Demo Trading API -> Create Demo Trading API Key —> Start your Demo Trading

 Note: `x-simulated-trading: 1` needs to be added to the header of the Demo Trading request.
Http Header Example

Content-Type: application/json

OK-ACCESS-KEY: 37c541a1-****-****-****-10fe7a038418

OK-ACCESS-SIGN: leaVRETrtaoEQ3yI9qEtI1CZ82ikZ4xSG5Kj8gnl3uw=

OK-ACCESS-PASSPHRASE: 1****6

OK-ACCESS-TIMESTAMP: 2020-03-28T12:21:41.274Z

x-simulated-trading: 1
Transaction Timeouts
Orders may not be processed in time due to network delay or busy OKX servers. You can configure the expiry time of the request using expTime if you want the order request to be discarded after a specific time.

If expTime is specified in the requests for Place (multiple) orders or Amend (multiple) orders, the request will not be processed if the current system time of the server is after the expTime.

REST API
Set the following parameters in the request header

Parameter	Type	Required	Description
expTime	String	No	Request effective deadline. Unix timestamp format in milliseconds, e.g. 1597026383085
The following endpoints are supported:

Place order
Place multiple orders
Amend order
Amend multiple orders
POST / Place sub order under signal bot trading
Request Example

curl -X 'POST' \
  'https://www.okx.com/api/v5/trade/order' \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -H 'OK-ACCESS-KEY: *****' \
  -H 'OK-ACCESS-SIGN: *****'' \
  -H 'OK-ACCESS-TIMESTAMP: *****'' \
  -H 'OK-ACCESS-PASSPHRASE: *****'' \
  -H 'expTime: 1597026383085' \   // request effective deadline
  -d '{
  "instId": "BTC-USDT",
  "tdMode": "cash",
  "side": "buy",
  "ordType": "limit",
  "px": "1000",
  "sz": "0.01"
}'
WebSocket
The following parameters are set in the request

Parameter	Type	Required	Description
expTime	String	No	Request effective deadline. Unix timestamp format in milliseconds, e.g. 1597026383085
The following endpoints are supported:

Place order
Place multiple orders
Amend order
Amend multiple orders
Request Example

{
    "id": "1512",
    "op": "order",
    "expTime":"1597026383085",  // request effective deadline
    "args": [{
        "side": "buy",
        "instId": "BTC-USDT",
        "tdMode": "isolated",
        "ordType": "market",
        "sz": "100"
    }]
}
Rate Limits
Our REST and WebSocket APIs use rate limits to protect our APIs against malicious usage so our trading platform can operate reliably and fairly.
When a request is rejected by our system due to rate limits, the system returns error code 50011 (Rate limit reached. Please refer to API documentation and throttle requests accordingly).
The rate limit is different for each endpoint. You can find the limit for each endpoint from the endpoint details. Rate limit definitions are detailed below:

WebSocket login and subscription rate limits are based on connection.

Public unauthenticated REST rate limits are based on IP address.

Private REST rate limits are based on User ID (sub-accounts have individual User IDs).

WebSocket order management rate limits are based on User ID (sub-accounts have individual User IDs).

Trading-related APIs
For Trading-related APIs (place order, cancel order, and amend order) the following conditions apply:

Rate limits are shared across the REST and WebSocket channels.

Rate limits for placing orders, amending orders, and cancelling orders are independent from each other.

Rate limits are defined on the Instrument ID level (except Options)

Rate limits for Options are defined based on the Instrument Family level. Refer to the Get instruments endpoint to view Instrument Family information.

Rate limits for a multiple order endpoint and a single order endpoint are also independent, with the exception being when there is only one order sent to a multiple order endpoint, the order will be counted as a single order and adopt the single order rate limit.

Sub-account rate limit
At the sub-account level, we allow a maximum of 1000 order requests per 2 seconds. Only new order requests and amendment order requests will be counted towards this limit. The limit encompasses all requests from the endpoints below. For batch order requests consisting of multiple orders, each order will be counted individually. Error code 50061 is returned when the sub-account rate limit is exceeded. The existing rate limit rule per instrument ID remains unchanged and the existing rate limit and sub-account rate limit will operate in parallel. If clients require a higher rate limit, clients can trade via multiple sub-accounts.

POST / Place order
POST / Place multiple orders
POST / Amend order
POST / Amend multiple orders

WS / Place order

WS / Place multiple orders

WS / Amend order

WS / Amend multiple orders

Fill ratio based sub-account rate limit
This is only applicable to >= VIP5 customers.
As an incentive for more efficient trading, the exchange will offer a higher sub-account rate limit to clients with a high trade fill ratio.

The exchange calculates two ratios based on the transaction data from the past 7 days at 00:00 UTC.

Sub-account fill ratio: This ratio is determined by dividing (the trade volume in USDT of the sub-account) by (sum of (new and amendment request count per symbol * symbol multiplier) of the sub-account). Note that the master trading account itself is also considered as a sub-account in this context.
Master account aggregated fill ratio: This ratio is calculated by dividing (the trade volume in USDT on the master account level) by (the sum (new and amendment count per symbol * symbol multiplier] of all sub-accounts).


The symbol multiplier allows for fine-tuning the weight of each symbol. A smaller symbol multiplier (<1) is used for smaller pairs that require more updates per trading volume. All instruments have a default symbol multiplier, and some instruments will have overridden symbol multipliers.

InstType	Override rule	Overridden symbol multiplier	Default symbol multiplier
Perpetual Futures	Per instrument ID	1
Instrument ID:
BTC-USDT-SWAP
BTC-USD-SWAP
ETH-USDT-SWAP
ETH-USD-SWAP	0.2
Expiry Futures	Per instrument Family	0.3
Instrument Family:
BTC-USDT
BTC-USD
ETH-USDT
ETH-USD	0.1
Spot	Per instrument ID	0.5
Instrument ID:
BTC-USDT
ETH-USDT	0.1
Options	Per instrument Family		0.1
The fill ratio computation excludes block trading, spread trading, MMP and fiat orders for order count; and excludes block trading, spread trading for trade volume. Only successful order requests (sCode=0) are considered.




At 08:00 UTC, the system will use the maximum value between the sub-account fill ratio and the master account aggregated fill ratio based on the data snapshot at 00:00 UTC to determine the sub-account rate limit based on the table below. For broker (non-disclosed) clients, the system considers the sub-account fill ratio only.

Fill ratio[x<=ratio<y)	Sub-account rate limit per 2 seconds(new and amendment)
Tier 1	[0,1)	1,000
Tier 2	[1,2)	1,250
Tier 3	[2,3)	1,500
Tier 4	[3,5)	1,750
Tier 5	[5,10)	2,000
Tier 6	[10,20)	2,500
Tier 7	[20,50)	3,000
Tier 8	>= 50	10,000
If there is an improvement in the fill ratio and rate limit to be uplifted, the uplift will take effect immediately at 08:00 UTC. However, if the fill ratio decreases and the rate limit needs to be lowered, a one-day grace period will be granted, and the lowered rate limit will only be implemented on T+1 at 08:00 UTC. On T+1, if the fill ratio improves, the higher rate limit will be applied accordingly. In the event of client demotion to VIP4, their rate limit will be downgraded to Tier 1, accompanied by a one-day grace period.



If the 7-day trading volume of a sub-account is less than 1,000,000 USDT, the fill ratio of the master account will be applied to it.



For newly created sub-accounts, the Tier 1 rate limit will be applied at creation until T+1 8am UTC, at which the normal rules will be applied.



Block trading, spread trading, MMP and spot/margin orders are exempted from the sub-account rate limit.



The exchange offers GET / Account rate limit endpoint that provides ratio and rate limit data, which will be updated daily at 8am UTC. It will return the sub-account fill ratio, the master account aggregated fill ratio, current sub-account rate limit and sub-account rate limit on T+1 (applicable if the rate limit is going to be demoted).

The fill ratio and rate limit calculation example is shown below. Client has 3 accounts, symbol multiplier for BTC-USDT-SWAP = 1 and XRP-USDT = 0.1.

Account A (master account):
BTC-USDT-SWAP trade volume = 100 USDT, order count = 10;
XRP-USDT trade volume = 20 USDT, order count = 15;
Sub-account ratio = (100+20) / (10 * 1 + 15 * 0.1) = 10.4
Account B (sub-account):
BTC-USDT-SWAP trade volume = 200 USDT, order count = 100;
XRP-USDT trade volume = 20 USDT, order count = 30;
Sub-account ratio = (200+20) / (100 * 1 + 30 * 0.1) = 2.13
Account C (sub-account):
BTC-USDT-SWAP trade volume = 300 USDT, order count = 1000;
XRP-USDT trade volume = 20 USDT, order count = 45;
Sub-account ratio = (300+20) / (100 * 1 + 45 * 0.1) = 3.06
Master account aggregated fill ratio = (100+20+200+20+300+20) / (10 * 1 + 15 * 0.1 + 100 * 1 + 30 * 0.1 + 100 * 1 + 45 * 0.1) = 3.01
Rate limit of accounts
Account A = max(10.4, 3.01) = 10.4 -> 2500 order requests/2s
Account B = max(2.13, 3.01) = 3.01 -> 1750 order requests/2s
Account C = max(3.06, 3.01) = 3.06 -> 1750 order requests/2s
Best practices
If you require a higher request rate than our rate limit, you can set up different sub-accounts to batch request rate limits. We recommend this method for throttling or spacing out requests in order to maximize each accounts' rate limit and avoid disconnections or rejections.

Trading Account
The API endpoints of Account require authentication.

REST API
Get instruments
Retrieve available instruments info of current account.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: User ID + Instrument Type
Permission: Read
HTTP Request
GET /api/v5/account/instruments

Request Example

GET /api/v5/account/instruments?instType=SPOT
Request Parameters
Parameter	Type	Required	Description
instType	String	Yes	Instrument type
SPOT: Spot
MARGIN: Margin
SWAP: Perpetual Futures
FUTURES: Expiry Futures
OPTION: Option
instFamily	String	Conditional	Instrument family
Only applicable to FUTURES/SWAP/OPTION. If instType is OPTION, instFamily is required.
instId	String	No	Instrument ID
Response Example

{
    "code": "0",
    "data": [
        {
            "auctionEndTime": "",
            "baseCcy": "BTC",
            "ctMult": "",
            "ctType": "",
            "ctVal": "",
            "ctValCcy": "",
            "contTdSwTime": "1704876947000",
            "elp": "0",
            "expTime": "",
            "futureSettlement": false,
            "groupId": "4",
            "instFamily": "",
            "instId": "BTC-EUR",
            "instType": "SPOT",
            "lever": "",
            "listTime": "1704876947000",
            "lotSz": "0.00000001",
            "maxIcebergSz": "9999999999.0000000000000000",
            "maxLmtAmt": "1000000",
            "maxLmtSz": "9999999999",
            "maxMktAmt": "1000000",
            "maxMktSz": "1000000",
            "maxPlatOILmt": "1000000000",
            "maxStopSz": "1000000",
            "maxTriggerSz": "9999999999.0000000000000000",
            "maxTwapSz": "9999999999.0000000000000000",
            "minSz": "0.00001",
            "optType": "",
            "openType": "call_auction",
            "preMktSwTime": "",
            "posLmtPct": "30",
            "posLmtAmt": "2500000",
            "quoteCcy": "EUR",
            "tradeQuoteCcyList": [
                "EUR"
            ],
            "settleCcy": "",
            "state": "live",
            "ruleType": "normal",
            "stk": "",
            "tickSz": "1",
            "uly": "",
            "instIdCode": 1000000000,   
            "instCategory": "1",
            "upcChg": [
                {
                    "param": "tickSz",
                    "newValue": "0.0001",
                    "effTime": "1704876947000"
                }
            ]
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID, e.g. BTC-USD-SWAP
uly	String	Underlying, e.g. BTC-USD
Only applicable to MARGIN/FUTURES/SWAP/OPTION
groupId	String	Instrument trading fee group ID
Spot:
1: Spot USDT
2: Spot USDC & Crypto
3: Spot TRY
4: Spot EUR
5: Spot BRL
7: Spot AED
8: Spot AUD
9: Spot USD
10: Spot SGD
11: Spot zero
12: Spot group one
13: Spot group two
14: Spot group three
15: Spot special rule

Expiry futures:
1: Expiry futures crypto-margined
2: Expiry futures USDT-margined
3: Expiry futures USDC-margined
4: Expiry futures premarket
5: Expiry futures group one
6: Expiry futures group two

Perpetual futures:
1: Perpetual futures crypto-margined
2: Perpetual futures USDT-margined
3: Perpetual futures USDC-margined
4: Perpetual futures group one
5: Perpetual futures group two
6: Stock perpetual futures

Options:
1: Options crypto-margined
2: Options USDC-margined

instType and groupId should be used together to determine a trading fee group. Users should use this endpoint together with fee rates endpoint to get the trading fee of a specific symbol.

Some enum values may not apply to you; the actual return values shall prevail.
instFamily	String	Instrument family, e.g. BTC-USD
Only applicable to MARGIN/FUTURES/SWAP/OPTION
baseCcy	String	Base currency, e.g. BTC inBTC-USDT
Only applicable to SPOT/MARGIN
quoteCcy	String	Quote currency, e.g. USDT in BTC-USDT
Only applicable to SPOT/MARGIN
settleCcy	String	Settlement and margin currency, e.g. BTC
Only applicable to FUTURES/SWAP/OPTION
ctVal	String	Contract value
Only applicable to FUTURES/SWAP/OPTION
ctMult	String	Contract multiplier
Only applicable to FUTURES/SWAP/OPTION
ctValCcy	String	Contract value currency
Only applicable to FUTURES/SWAP/OPTION
optType	String	Option type, C: Call P: put
Only applicable to OPTION
stk	String	Strike price
Only applicable to OPTION
listTime	String	Listing time, Unix timestamp format in milliseconds, e.g. 1597026383085
auctionEndTime	String	The end time of call auction, Unix timestamp format in milliseconds, e.g. 1597026383085
Only applicable to SPOT that are listed through call auctions, return "" in other cases (deprecated, use contTdSwTime)
contTdSwTime	String	Continuous trading switch time. The switch time from call auction, prequote to continuous trading, Unix timestamp format in milliseconds. e.g. 1597026383085.
Only applicable to SPOT/MARGIN that are listed through call auction or prequote, return "" in other cases.
preMktSwTime	String	The time premarket swap switched to normal swap, Unix timestamp format in milliseconds, e.g. 1597026383085.
Only applicable premarket SWAP
openType	String	Open type
fix_price: fix price opening
pre_quote: pre-quote
call_auction: call auction
Only applicable to SPOT/MARGIN, return "" for all other business lines
elp	String	ELP maker permission
0: ELP is not enabled for this symbol
1: ELP is enabled for this symbol, but current users don't have permission to place ELP orders for it.
2: ELP is enabled for this symbol, and current users have permission to place ELP orders for it.

It doesn't mean there will be ELP liquidity when elp is 1/2.
expTime	String	Expiry time
Applicable to SPOT/MARGIN/FUTURES/SWAP/OPTION. For FUTURES/OPTION, it is natural delivery/exercise time. It is the instrument offline time when there is SPOT/MARGIN/FUTURES/SWAP/ manual offline. Update once change.
lever	String	Max Leverage,
Not applicable to SPOT, OPTION
tickSz	String	Tick size, e.g. 0.0001
For Option, it is minimum tickSz among tick band, please use "Get option tick bands" if you want get option tickBands.
lotSz	String	Lot size
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
minSz	String	Minimum order size
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
ctType	String	Contract type
linear: linear contract
inverse: inverse contract
Only applicable to FUTURES/SWAP
state	String	Instrument status
live
suspend
rebase: can't be traded during rebasing, only applicable to SWAP
preopen e.g. Futures and options contracts rollover from generation to trading start; certain symbols before they go live
test: Test pairs, can't be traded
ruleType	String	Trading rule types
normal: normal trading
pre_market: pre-market trading
rebase_contract: pre-market rebase contract
xperp: perpetual-style futures, only applicable to certain FUTURES contracts
posLmtAmt	String	Maximum position value (USD) for this instrument at the user level (shared across master and sub-accounts), based on the notional value of all same-direction open positions and resting orders. The effective user limit is max(posLmtAmt, oiUSD × posLmtPct). Applicable to SWAP/FUTURES.
posLmtPct	String	Maximum position ratio (e.g., 30 for 30%) a user (shared across master and sub-accounts) may hold relative to the platform's current total position value. The effective user limit is max(posLmtAmt, oiUSD × posLmtPct). Applicable to SWAP/FUTURES.
maxPlatOILmt	String	Platform-wide maximum position value (USD) for this instrument. If the global position limit switch is enabled and platform total open interest reaches or exceeds this value, all users’ new opening orders for this instrument are rejected; otherwise, orders pass.
longPosRemainingQuota	String	The remaining long position value (USD) the user is permitted to open, netting all existing long positions and resting buy orders. The quota is shared across the master account and all subaccounts.
shortPosRemainingQuota	String	The remaining short position value (USD) the user is permitted to open, netting all existing short positions and resting sell orders. The quota is shared across the master account and all subaccounts.
maxLmtSz	String	The maximum order quantity of a single limit order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
maxMktSz	String	The maximum order quantity of a single market order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in USDT.
maxLmtAmt	String	Max USD amount for a single limit order
maxMktAmt	String	Max USD amount for a single market order
Only applicable to SPOT/MARGIN
maxTwapSz	String	The maximum order quantity of a single TWAP order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
The minimum order quantity of a single TWAP order is minSz*2
maxIcebergSz	String	The maximum order quantity of a single iceBerg order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
maxTriggerSz	String	The maximum order quantity of a single trigger order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
maxStopSz	String	The maximum order quantity of a single stop market order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in USDT.
futureSettlement	Boolean	Whether daily settlement for expiry feature is enabled
Applicable to FUTURES cross
tradeQuoteCcyList	Array of strings	List of quote currencies available for trading, e.g. ["USD", "USDC"].
instIdCode	Integer	Instrument ID code.
For simple binary encoding, you must use instIdCode instead of instId.
For the same instId, it's value may be different between production and demo trading.
It is null when the value is not generated.
instCategory	String	The asset category of the instrument’s base asset (the first segment of the instrument ID). For example, for BTC-USDT-SWAP, the instCategory represents the asset category of BTC.
1: Crypto
3: Stocks
4: Commodities
5: Forex
6: Bonds
"": Not available
upcChg	Array of objects	Upcoming changes. It is [] when there is no upcoming change.
> param	String	The parameter name to be updated.
tickSz
minSz
maxMktSz
> newValue	String	The parameter value that will replace the current one.
> effTime	String	Effective time. Unix timestamp format in milliseconds, e.g. 1597026383085
 listTime and contTdSwTime
For spot symbols listed through a call auction or pre-open, listTime represents the start time of the auction or pre-open, and contTdSwTime indicates the end of the auction or pre-open and the start of continuous trading. For other scenarios, listTime will mark the beginning of continuous trading, and contTdSwTime will return an empty value "".
 state
The state will always change from `preopen` to `live` when the listTime is reached.
When a product is going to be delisted (e.g. when a FUTURES contract is settled or OPTION contract is exercised), the instrument will not be available.
Get balance
Retrieve a list of assets (with non-zero balance), remaining balance, and available amount in the trading account.

 Interest-free quota and discount rates are public data and not displayed on the account interface.
Rate Limit: 10 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/balance

Request Example

# Get the balance of all assets in the account
GET /api/v5/account/balance

# Get the balance of BTC and ETH assets in the account
GET /api/v5/account/balance?ccy=BTC,ETH

Request Parameters
Parameters	Types	Required	Description
ccy	String	No	Single currency or multiple currencies (no more than 20) separated with comma, e.g. BTC or BTC,ETH.
Response Example

{
    "code": "0",
    "data": [
        {
            "adjEq": "55415.624719833286",
            "availEq": "55415.624719833286",
            "borrowFroz": "0",
            "delta": "0",
            "deltaLever": "0",
            "deltaNeutralStatus": "0",
            "details": [
                {
                    "autoLendStatus": "off",
                    "autoLendMtAmt": "0",
                    "availBal": "4834.317093622894",
                    "availEq": "4834.3170936228935",
                    "borrowFroz": "0",
                    "cashBal": "4850.435693622894",
                    "ccy": "USDT",
                    "crossLiab": "0",
                    "colRes": "0",
                    "collateralEnabled": false,
                    "collateralRestrict": false,
                    "colBorrAutoConversion": "0",
                    "disEq": "4991.542013297616",
                    "eq": "4992.890093622894",
                    "eqUsd": "4991.542013297616",
                    "smtSyncEq": "0",
                    "spotCopyTradingEq": "0",
                    "fixedBal": "0",
                    "frozenBal": "158.573",
                    "frpType": "0",
                    "imr": "",
                    "interest": "0",
                    "isoEq": "0",
                    "isoLiab": "0",
                    "isoUpl": "0",
                    "liab": "0",
                    "maxLoan": "0",
                    "mgnRatio": "",
                    "mmr": "",
                    "notionalLever": "",
                    "ordFrozen": "0",
                    "rewardBal": "0",
                    "spotInUseAmt": "",
                    "clSpotInUseAmt": "",
                    "maxSpotInUse": "",
                    "spotIsoBal": "0",
                    "stgyEq": "150",
                    "twap": "0",
                    "uTime": "1705449605015",
                    "upl": "-7.545600000000006",
                    "uplLiab": "0",
                    "spotBal": "",
                    "openAvgPx": "",
                    "accAvgPx": "",
                    "spotUpl": "",
                    "spotUplRatio": "",
                    "totalPnl": "",
                    "totalPnlRatio": ""
                }
            ],
            "imr": "0",
            "isoEq": "0",
            "mgnRatio": "",
            "mmr": "0",
            "notionalUsd": "0",
            "notionalUsdForBorrow": "0",
            "notionalUsdForFutures": "0",
            "notionalUsdForOption": "0",
            "notionalUsdForSwap": "0",
            "ordFroz": "",
            "totalEq": "55837.43556134779",
            "uTime": "1705474164160",
            "upl": "0"
        }
    ],
    "msg": ""
}
Response Parameters
Parameters	Types	Description
uTime	String	Update time of account information, millisecond format of Unix timestamp, e.g. 1597026383085
totalEq	String	Total account assets denominated in USD
isoEq	String	Isolated margin equity in USD
Applicable to Futures mode/Multi-currency margin/Portfolio margin
adjEq	String	Adjusted / Effective equity in USD
The net fiat value of the assets in the account that can provide margins for spot, expiry futures, perpetual futures and options under the cross-margin mode.
In multi-ccy or PM mode, the asset and margin requirement will all be converted to USD value to process the order check or liquidation.
Due to the volatility of each currency market, our platform calculates the actual USD value of each currency based on discount rates to balance market risks.
Applicable to Spot mode/Multi-currency margin and Portfolio margin
availEq	String	Account level available equity, excluding currencies that are restricted due to the collateralized borrowing limit.
Applicable to Multi-currency margin/Portfolio margin
ordFroz	String	Cross margin frozen for pending orders in USD
Only applicable to Spot mode/Multi-currency margin/Portfolio margin
imr	String	Initial margin requirement in USD
The sum of initial margins of all open positions and pending orders under cross-margin mode in USD.
Applicable to Spot mode/Multi-currency margin/Portfolio margin
mmr	String	Maintenance margin requirement in USD
The sum of maintenance margins of all open positions and pending orders under cross-margin mode in USD.
Applicable to Spot mode/Multi-currency margin/Portfolio margin
borrowFroz	String	Potential borrowing IMR of the account in USD
Only applicable to Spot mode/Multi-currency margin/Portfolio margin. It is "" for other margin modes.
mgnRatio	String	Maintenance margin ratio in USD
Applicable to Spot mode/Multi-currency margin/Portfolio margin
notionalUsd	String	Notional value of positions in USD
Applicable to Spot mode/Multi-currency margin/Portfolio margin
notionalUsdForBorrow	String	Notional value for Borrow in USD
Applicable to Spot mode/Multi-currency margin/Portfolio margin
notionalUsdForSwap	String	Notional value of positions for Perpetual Futures in USD
Applicable to Multi-currency margin/Portfolio margin
notionalUsdForFutures	String	Notional value of positions for Expiry Futures in USD
Applicable to Multi-currency margin/Portfolio margin
notionalUsdForOption	String	Notional value of positions for Option in USD
Applicable to Spot mode/Multi-currency margin/Portfolio margin
upl	String	Cross-margin info of unrealized profit and loss at the account level in USD
Applicable to Multi-currency margin/Portfolio margin
delta	String	Delta (USD)
deltaLever	String	Delta neutral strategy account level delta leverage
deltaLever = delta / totalEq
deltaNeutralStatus	String	Delta risk status
0: normal
1: transfer restricted
2: delta reducing - cancel all pending orders if delta is greater than 5000 USD, only one delta reducing order allowed per index (spot, futures, swap)
details	Array of objects	Detailed asset information in all currencies
> ccy	String	Currency
> eq	String	Equity of currency
> cashBal	String	Cash balance
> uTime	String	Update time of currency balance information, Unix timestamp format in milliseconds, e.g. 1597026383085
> isoEq	String	Isolated margin equity of currency
Applicable to Futures mode/Multi-currency margin/Portfolio margin
> availEq	String	Available equity of currency
Applicable to Futures mode/Multi-currency margin/Portfolio margin
> disEq	String	Discount equity of currency in USD.
Applicable to Spot mode(enabled spot borrow)/Multi-currency margin/Portfolio margin
> fixedBal	String	Frozen balance for Dip Sniper and Peak Sniper
> availBal	String	Available balance of currency
> frozenBal	String	Frozen balance of currency
> ordFrozen	String	Margin frozen for open orders
Applicable to Spot mode/Futures mode/Multi-currency margin
> liab	String	Liabilities of currency
It is a positive value, e.g. 21625.64
Applicable to Spot mode/Multi-currency margin/Portfolio margin
> upl	String	The sum of the unrealized profit & loss of all margin and derivatives positions of currency.
Applicable to Futures mode/Multi-currency margin/Portfolio margin
> uplLiab	String	Liabilities due to Unrealized loss of currency
Applicable to Multi-currency margin/Portfolio margin
> crossLiab	String	Cross liabilities of currency
Applicable to Spot mode/Multi-currency margin/Portfolio margin
> rewardBal	String	Trial fund balance
> isoLiab	String	Isolated liabilities of currency
Applicable to Multi-currency margin/Portfolio margin
> mgnRatio	String	Cross maintenance margin ratio of currency
The index for measuring the risk of a certain asset in the account.
Applicable to Futures mode and when there is cross position
> imr	String	Cross initial margin requirement at the currency level
Applicable to Futures mode and when there is cross position
> mmr	String	Cross maintenance margin requirement at the currency level
Applicable to Futures mode and when there is cross position
> interest	String	Accrued interest of currency
It is a positive value, e.g. 9.01
Applicable to Spot mode/Multi-currency margin/Portfolio margin
> twap	String	Risk indicator of forced repayment
Divided into multiple levels from 0 to 5, the larger the number, the more likely the forced repayment will be triggered.
Applicable to Spot mode/Multi-currency margin/Portfolio margin
> frpType	String	Forced repayment (FRP) type
0: no FRP
1: user based FRP
2: platform based FRP

Return 1/2 when twap is >= 1, applicable to Spot mode/Multi-currency margin/Portfolio margin
> maxLoan	String	Maximum borrowable amount for the currency under the current account conditions. Affects the amount available for margin borrowing and transfers.
Applicable to cross of Spot mode/Multi-currency margin/Portfolio margin
> eqUsd	String	Equity in USD of currency
> borrowFroz	String	Potential borrowing IMR of currency in USD
Applicable to Multi-currency margin/Portfolio margin. It is "" for other margin modes.
> notionalLever	String	Leverage of currency
Applicable to Futures mode
> stgyEq	String	Total equity allocated to trading bots for the currency. Covers Spot Grid, Futures Grid, Signal Bot, Futures Martingale, Spot Martingale, Infinite Grid, and Recurring Buy strategies.
> isoUpl	String	Isolated unrealized profit and loss of currency
Applicable to Futures mode/Multi-currency margin/Portfolio margin
> spotInUseAmt	String	Actual spot hedging amount in use for the currency.
Applicable to Portfolio margin
> clSpotInUseAmt	String	User-defined spot hedging amount for the currency. Applicable to Portfolio margin
> maxSpotInUse	String	System-calculated maximum possible spot hedging amount for the currency.
Applicable to Portfolio margin
> spotIsoBal	String	Balance acquired through spot copy trading (as a follower or lead trader), including amounts currently frozen by open orders. For example, if 1 BTC was purchased via copy trading and 0.4 BTC is frozen in an open sell order, spotIsoBal returns 1, not 0.6.
Applicable to copy trading. Applicable to Spot mode/Futures mode.
> smtSyncEq	String	Smart sync equity
The default is "0", only applicable to copy trader.
> spotCopyTradingEq	String	Spot smart sync equity.
The default is "0", only applicable to copy trader.
> spotBal	String	Spot balance. The unit is currency, e.g. BTC. More details
> openAvgPx	String	Spot average cost price. The unit is USD. More details
> accAvgPx	String	Spot accumulated cost price. The unit is USD. More details
> spotUpl	String	Spot unrealized profit and loss. The unit is USD. More details
> spotUplRatio	String	Spot unrealized profit and loss ratio. More details
> totalPnl	String	Spot accumulated profit and loss. The unit is USD. More details
> totalPnlRatio	String	Spot accumulated profit and loss ratio. More details
> colRes	String	Platform level collateral restriction status
0: The restriction is not enabled.
1: The restriction is not enabled. But the crypto is close to the platform's collateral limit.
2: The restriction is enabled. This crypto can't be used as margin for your new orders. This may result in failed orders. But it will still be included in the account's adjusted equity and doesn't impact margin ratio.
Refer to Introduction to the platform collateralized borrowing limit for more details.
> colBorrAutoConversion	String	Risk indicator of auto conversion. Divided into multiple levels from 1-5, the larger the number, the more likely the repayment will be triggered. The default will be 0, indicating there is no risk currently. 5 means this user is undergoing auto conversion now, 4 means this user will undergo auto conversion soon whereas 1/2/3 indicates there is a risk for auto conversion.
Applicable to Spot mode/Futures mode/Multi-currency margin/Portfolio margin
When the total liability for each crypto set as collateral exceeds a certain percentage of the platform's total limit, the auto-conversion mechanism may be triggered. This may result in the automatic sale of excess collateral crypto if you've set this crypto as collateral and have large borrowings. To lower this risk, consider reducing your use of the crypto as collateral or reducing your liabilities.
Refer to Introduction to the platform collateralized borrowing limit for more details.
> collateralRestrict	Boolean	Platform level collateralized borrow restriction
true
false(deprecated, use colRes instead)
> collateralEnabled	Boolean	true: Collateral enabled
false: Collateral disabled
Applicable to Multi-currency margin
> autoLendStatus	String	Auto lend status
unsupported: auto lend is not supported by this currency
off: auto lend is supported but turned off
pending: auto lend is turned on but pending matching
active: auto lend is turned on and matched
> autoLendMtAmt	String	Auto lend currency matched amount
Return "0" when autoLendStatus is unsupported/off/pending. Return matched amount when autoLendStatus is active
Regarding more parameter details, you can refer to product documentations below:
Futures mode: cross margin trading
Multi-currency margin mode: cross margin trading
Multi-currency margin mode vs. Portfolio margin mode
 "" will be returned for inapplicable fields under the current account level.
 The currency details will not be returned when cashBal and eq is both 0.
Distribution of applicable fields under each account level are as follows:

Parameters	Spot mode	Futures mode	Multi-currency margin mode	Portfolio margin mode
uTime	Yes	Yes	Yes	Yes
totalEq	Yes	Yes	Yes	Yes
isoEq		Yes	Yes	Yes
adjEq	Yes		Yes	Yes
availEq			Yes	Yes
ordFroz	Yes		Yes	Yes
imr	Yes		Yes	Yes
mmr	Yes		Yes	Yes
borrowFroz	Yes		Yes	Yes
mgnRatio	Yes		Yes	Yes
notionalUsd	Yes		Yes	Yes
notionalUsdForSwap			Yes	Yes
notionalUsdForFutures			Yes	Yes
notionalUsdForOption	Yes		Yes	Yes
notionalUsdForBorrow	Yes		Yes	Yes
upl			Yes	Yes
details	Yes	Yes	Yes	Yes
> ccy	Yes	Yes	Yes	Yes
> eq	Yes	Yes	Yes	Yes
> cashBal	Yes	Yes	Yes	Yes
> uTime	Yes	Yes	Yes	Yes
> isoEq		Yes	Yes	Yes
> availEq		Yes	Yes	Yes
> disEq	Yes		Yes	Yes
> availBal	Yes	Yes	Yes	Yes
> frozenBal	Yes	Yes	Yes	Yes
> ordFrozen	Yes	Yes	Yes	Yes
> liab	Yes		Yes	Yes
> upl		Yes	Yes	Yes
> uplLiab			Yes	Yes
> crossLiab	Yes		Yes	Yes
> isoLiab			Yes	Yes
> mgnRatio		Yes		
> interest	Yes		Yes	Yes
> twap	Yes		Yes	Yes
> maxLoan	Yes		Yes	Yes
> eqUsd	Yes	Yes	Yes	Yes
> borrowFroz	Yes		Yes	Yes
> notionalLever		Yes		
> stgyEq	Yes	Yes	Yes	Yes
> isoUpl		Yes	Yes	Yes
> spotInUseAmt				Yes
> clSpotInUseAmt				Yes
> maxSpotInUse				Yes
> spotIsoBal	Yes	Yes		
> imr		Yes		
> mmr		Yes		
> smtSyncEq	Yes	Yes	Yes	Yes
> spotCopyTradingEq	Yes	Yes	Yes	Yes
> spotBal	Yes	Yes	Yes	Yes
> openAvgPx	Yes	Yes	Yes	Yes
> accAvgPx	Yes	Yes	Yes	Yes
> spotUpl	Yes	Yes	Yes	Yes
> spotUplRatio	Yes	Yes	Yes	Yes
> totalPnl	Yes	Yes	Yes	Yes
> totalPnlRatio	Yes	Yes	Yes	Yes
> collateralEnabled			Yes	
Get positions
Retrieve information on your positions. When the account is in net mode, net positions will be displayed, and when the account is in long/short mode, long or short positions will be displayed. Return in reverse chronological order using ctime.

Rate Limit: 10 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/positions

Request Example

# Query BTC-USDT position information
GET /api/v5/account/positions?instId=BTC-USDT

Request Parameters
Parameter	Type	Required	Description
instType	String	No	Instrument type
MARGIN
SWAP
FUTURES
OPTION
instId will be checked against instType when both parameters are passed.
instId	String	No	Instrument ID, e.g. BTC-USDT-SWAP. Single instrument ID or multiple instrument IDs (no more than 10) separated with comma
posId	String	No	Single position ID or multiple position IDs (no more than 20) separated with comma.
There is attribute expiration, the posId and position information will be cleared if it is more than 30 days after the last full close position.
 instId
If the instrument ever had position and its open interest is 0, it will return the position information with specific instId. It will not return the position information with specific instId if there is no valid posId; it will not return the position information without specific instId.
 In the isolated margin trading settings, if it is set to the manual transfers mode, after the position is transferred to the margin, a position with a position of 0 will be generated
Response Example

{
    "code": "0",
    "data": [
        {
            "adl": "1",
            "availPos": "0.00190433573",
            "avgPx": "62961.4",
            "baseBal": "",
            "baseBorrowed": "",
            "baseInterest": "",
            "bePx": "",
            "bizRefId": "",
            "bizRefType": "",
            "cTime": "1724740225685",
            "ccy": "BTC",
            "clSpotInUseAmt": "",
            "closeOrderAlgo": [],
            "deltaBS": "",
            "deltaPA": "",
            "fee": "",
            "fundingFee": "",
            "gammaBS": "",
            "gammaPA": "",
            "hedgedPos": "",
            "idxPx": "62890.5",
            "imr": "",
            "instId": "BTC-USDT",
            "instType": "MARGIN",
            "interest": "0",
            "last": "62892.9",
            "lever": "5",
            "liab": "-99.9998177776581948",
            "liabCcy": "USDT",
            "liqPenalty": "",
            "liqPx": "53615.448336593756",
            "margin": "0.000317654",
            "markPx": "62891.9",
            "maxSpotInUseAmt": "",
            "mgnMode": "isolated",
            "mgnRatio": "9.404143929947395",
            "mmr": "0.0000318005395854",
            "notionalUsd": "119.756628017499",
            "optVal": "",
            "pendingCloseOrdLiabVal": "0",
            "pnl": "",
            "pos": "0.00190433573",
            "posCcy": "BTC",
            "posId": "1752810569801498626",
            "posSide": "net",
            "quoteBal": "",
            "quoteBorrowed": "",
            "quoteInterest": "",
            "realizedPnl": "",
            "spotInUseAmt": "",
            "spotInUseCcy": "",
            "thetaBS": "",
            "thetaPA": "",
            "tradeId": "785524470",
            "uTime": "1724742632153",
            "upl": "-0.0000033452492717",
            "uplLastPx": "-0.0000033199677697",
            "uplRatio": "-0.0105311101755551",
            "uplRatioLastPx": "-0.0104515220008934",
            "usdPx": "",
            "vegaBS": "",
            "vegaPA": "",
            "nonSettleAvgPx":"",
            "settledPnl":""
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
mgnMode	String	Margin mode
cross
isolated
posId	String	Position ID
posSide	String	Position side
long, pos is positive
short, pos is positive
net (FUTURES/SWAP/OPTION: positive pos means long position and negative pos means short position. For MARGIN, pos is always positive, posCcy being base currency means long position, posCcy being quote currency means short position.)
pos	String	Quantity of positions. In the isolated margin mode, when doing manual transfers, a position with pos of 0 will be generated after the deposit is transferred
hedgedPos	String	Hedged position size
Only return for accounts in delta neutral strategy, stgyType:1. Return "" for accounts in general strategy.
baseBal	String	Base currency balance, only applicable to MARGIN（Quick Margin Mode）(Deprecated)
quoteBal	String	Quote currency balance, only applicable to MARGIN（Quick Margin Mode）(Deprecated)
baseBorrowed	String	Base currency amount already borrowed, only applicable to MARGIN(Quick Margin Mode）(Deprecated)
baseInterest	String	Base Interest, undeducted interest that has been incurred, only applicable to MARGIN(Quick Margin Mode）(Deprecated)
quoteBorrowed	String	Quote currency amount already borrowed, only applicable to MARGIN(Quick Margin Mode）(Deprecated)
quoteInterest	String	Quote Interest, undeducted interest that has been incurred, only applicable to MARGIN(Quick Margin Mode）(Deprecated)
posCcy	String	Position currency, only applicable to MARGIN positions.
availPos	String	Position that can be closed
Only applicable to MARGIN and OPTION.
For MARGIN position, the rest of sz will be SPOT trading after the liability is repaid while closing the position. Please get the available reduce-only amount from "Get maximum available tradable amount" if you want to reduce the amount of SPOT trading as much as possible.
avgPx	String	Average open price
Under cross-margin mode, the entry price of expiry futures will update at settlement to the last settlement price, and when the position is opened or increased.
nonSettleAvgPx	String	Non-settlement entry price
The non-settlement entry price only reflects the average price at which the position is opened or increased.
Applicable to cross FUTURES positions.
markPx	String	Latest Mark price
upl	String	Unrealized profit and loss calculated by mark price.
uplRatio	String	Unrealized profit and loss ratio calculated by mark price.
uplLastPx	String	Unrealized profit and loss calculated by last price. Main usage is showing, actual value is upl.
uplRatioLastPx	String	Unrealized profit and loss ratio calculated by last price.
instId	String	Instrument ID, e.g. BTC-USDT-SWAP
lever	String	Leverage
Not applicable to OPTION and positions of cross margin mode under Portfolio margin
liqPx	String	Estimated liquidation price
Not applicable to OPTION
imr	String	Initial margin requirement, only applicable to cross.
margin	String	Margin, can be added or reduced. Only applicable to isolated.
mgnRatio	String	Maintenance margin ratio
mmr	String	Maintenance margin requirement
liab	String	Liabilities, only applicable to MARGIN.
liabCcy	String	Liabilities currency, only applicable to MARGIN.
interest	String	Interest. Undeducted interest that has been incurred.
tradeId	String	Last trade ID
optVal	String	Option Value, only applicable to OPTION.
pendingCloseOrdLiabVal	String	The amount of close orders of isolated margin liability.
notionalUsd	String	Notional value of positions in USD
adl	String	Auto-deleveraging (ADL) indicator
Divided into 6 levels, from 0 to 5, the smaller the number, the weaker the adl intensity.
Only applicable to FUTURES/SWAP/OPTION
ccy	String	Currency used for margin
last	String	Latest traded price
idxPx	String	Latest underlying index price
usdPx	String	Latest USD price of the ccy on the market, only applicable to FUTURES/SWAP/OPTION
bePx	String	Breakeven price
deltaBS	String	delta: Black-Scholes Greeks in dollars, only applicable to OPTION
deltaPA	String	delta: Greeks in coins, only applicable to OPTION
gammaBS	String	gamma: Black-Scholes Greeks in dollars, only applicable to OPTION
gammaPA	String	gamma: Greeks in coins, only applicable to OPTION
thetaBS	String	theta：Black-Scholes Greeks in dollars, only applicable to OPTION
thetaPA	String	theta：Greeks in coins, only applicable to OPTION
vegaBS	String	vega：Black-Scholes Greeks in dollars, only applicable to OPTION
vegaPA	String	vega：Greeks in coins, only applicable to OPTION
spotInUseAmt	String	Spot in use amount
Applicable to Portfolio margin
spotInUseCcy	String	Spot in use unit, e.g. BTC
Applicable to Portfolio margin
clSpotInUseAmt	String	User-defined spot risk offset amount
Applicable to Portfolio margin
maxSpotInUseAmt	String	Max possible spot risk offset amount
Applicable to Portfolio margin
bizRefId	String	External business id, e.g. experience coupon id
bizRefType	String	External business type
realizedPnl	String	Realized profit and loss
Only applicable to FUTURES/SWAP/OPTION
realizedPnl=pnl+fee+fundingFee+liqPenalty+settledPnl
settledPnl	String	Accumulated settled profit and loss (calculated by settlement price)
Only applicable to cross FUTURES
pnl	String	Accumulated pnl of closing order(s) (excluding the fee).
fee	String	Accumulated fee
Negative number represents the user transaction fee charged by the platform.Positive number represents rebate.
fundingFee	String	Accumulated funding fee
liqPenalty	String	Accumulated liquidation penalty. It is negative when there is a value.
closeOrderAlgo	Array of objects	Close position algo orders attached to the position. This array will have values only after you request "Place algo order" with closeFraction=1.
> algoId	String	Algo ID
> slTriggerPx	String	Stop-loss trigger price.
> slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
> tpTriggerPx	String	Take-profit trigger price.
> tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
> closeFraction	String	Fraction of position to be closed when the algo order is triggered.
cTime	String	Creation time, Unix timestamp format in milliseconds, e.g. 1597026383085
uTime	String	Latest time position was adjusted, Unix timestamp format in milliseconds, e.g. 1597026383085
As for portfolio margin account, the IMR and MMR of the position are calculated in risk unit granularity, thus their values of the same risk unit cross positions are the same.

Get positions history
Retrieve the updated position data for the last 3 months. Return in reverse chronological order using utime. Getting positions history is supported under Portfolio margin mode since 04:00 AM (UTC) on November 11, 2024.

Rate Limit: 10 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/positions-history

Request Example

GET /api/v5/account/positions-history
Request Parameters
Parameter	Type	Required	Description
instType	String	No	Instrument type
MARGIN
SWAP
FUTURES
OPTION
instId	String	No	Instrument ID, e.g. BTC-USD-SWAP
mgnMode	String	No	Margin mode
cross isolated
type	String	No	The type of latest close position
1: Close position partially;2：Close all;3：Liquidation;4：Partial liquidation; 5：ADL - position not fully closed; 6：ADL - position fully closed
It is the latest type if there are several types for the same position.
posId	String	No	Position ID. There is attribute expiration. The posId will be expired if it is more than 30 days after the last full close position, then position will use new posId.
after	String	No	Pagination of data to return records earlier than the requested uTime, Unix timestamp format in milliseconds, e.g. 1597026383085
before	String	No	Pagination of data to return records newer than the requested uTime, Unix timestamp format in milliseconds, e.g. 1597026383085
limit	String	No	Number of results per request. The maximum is 100. The default is 100. All records that have the same uTime will be returned at the current request
Response Example

{
    "code": "0",
    "data": [
        {
            "cTime": "1654177169995",
            "ccy": "BTC",
            "closeAvgPx": "29786.5999999789081085",
            "closeTotalPos": "1",
            "instId": "BTC-USD-SWAP",
            "instType": "SWAP",
            "lever": "10.0",
            "mgnMode": "cross",
            "openAvgPx": "29783.8999999995535393",
            "openMaxPos": "1",
            "realizedPnl": "0.001",
            "fee": "-0.0001",
            "fundingFee": "0",
            "liqPenalty": "0",
            "pnl": "0.0011",
            "pnlRatio": "0.000906447858888",
            "posId": "452587086133239818",
            "posSide": "long",
            "direction": "long",
            "triggerPx": "",
            "type": "1",
            "uTime": "1654177174419",
            "uly": "BTC-USD",
            "nonSettleAvgPx":"",
            "settledPnl":""
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID
mgnMode	String	Margin mode
cross isolated
type	String	The type of latest close position
1：Close position partially;2：Close all;3：Liquidation;4：Partial liquidation; 5：ADL;
It is the latest type if there are several types for the same position.
cTime	String	Created time of position
uTime	String	Updated time of position
openAvgPx	String	Average price of opening position
Under cross-margin mode, the entry price of expiry futures will update at settlement to the last settlement price, and when the position is opened or increased.
nonSettleAvgPx	String	Non-settlement entry price
The non-settlement entry price only reflects the average price at which the position is opened or increased.
Only applicable to cross FUTURES
closeAvgPx	String	Average price of closing position
posId	String	Position ID
openMaxPos	String	Max quantity of position
closeTotalPos	String	Position's cumulative closed volume
realizedPnl	String	Realized profit and loss
Only applicable to FUTURES/SWAP/OPTION
realizedPnl=pnl+fee+fundingFee+liqPenalty+settledPnl
settledPnl	String	Accumulated settled profit and loss (calculated by settlement price)
Only applicable to cross FUTURES
pnlRatio	String	Realized P&L ratio
fee	String	Accumulated fee
Negative number represents the user transaction fee charged by the platform.Positive number represents rebate.
fundingFee	String	Accumulated funding fee
liqPenalty	String	Accumulated liquidation penalty. It is negative when there is a value.
pnl	String	Profit and loss (excluding the fee).
posSide	String	Position mode side
long: Hedge mode long
short: Hedge mode short
net: Net mode
lever	String	Leverage
direction	String	Direction: long short
Only applicable to MARGIN/FUTURES/SWAP/OPTION
triggerPx	String	trigger mark price. There is value when type is equal to 3, 4 or 5. It is "" when type is equal to 1 or 2
uly	String	Underlying
ccy	String	Currency used for margin
Get account and position risk
Get account and position risk

 Obtain basic information about accounts and positions on the same time snapshot
Rate Limit: 10 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/account-position-risk

Request Example

GET /api/v5/account/account-position-risk

Request Parameters
Parameter	Type	Required	Description
instType	String	No	Instrument type
MARGIN
SWAP
FUTURES
OPTION
Response Example

{
    "code":"0",
    "data":[
        {
            "adjEq":"174238.6793649711331679",
            "balData":[
                {
                    "ccy":"BTC",
                    "disEq":"78846.7803721021362242",
                    "eq":"1.3863533369419636"
                },
                {
                    "ccy":"USDT",
                    "disEq":"73417.2495112863300127",
                    "eq":"73323.395564963177146"
                }
            ],
            "posData":[
                {
                    "baseBal": "0.4",
                    "ccy": "",
                    "instId": "BTC-USDT",
                    "instType": "MARGIN",
                    "mgnMode": "isolated",
                    "notionalCcy": "0",
                    "notionalUsd": "0",
                    "pos": "0",
                    "posCcy": "",
                    "posId": "310388685292318723",
                    "posSide": "net",
                    "quoteBal": "0"
                }
            ],
            "ts":"1620282889345"
        }
    ],
    "msg":""
}
Response Parameters
Parameters	Types	Description
ts	String	Update time of account information, millisecond format of Unix timestamp, e.g. 1597026383085
adjEq	String	Adjusted / Effective equity in USD
Applicable to Multi-currency margin and Portfolio margin
balData	Array of objects	Detailed asset information in all currencies
> ccy	String	Currency
> eq	String	Equity of currency
> disEq	String	Discount equity of currency in USD.
posData	Array of objects	Detailed position information in all currencies
> instType	String	Instrument type
> mgnMode	String	Margin mode
cross
isolated
> posId	String	Position ID
> instId	String	Instrument ID, e.g. BTC-USDT-SWAP
> pos	String	Quantity of positions contract. In the isolated margin mode, when doing manual transfers, a position with pos of 0 will be generated after the deposit is transferred
> baseBal	String	Base currency balance, only applicable to MARGIN（Quick Margin Mode）(Deprecated)
> quoteBal	String	Quote currency balance, only applicable to MARGIN（Quick Margin Mode）(Deprecated)
> posSide	String	Position side
long
short
net (FUTURES/SWAP/OPTION: positive pos means long position and negative pos means short position. MARGIN: posCcy being base currency means long position, posCcy being quote currency means short position.)
> posCcy	String	Position currency, only applicable to MARGIN positions.
> ccy	String	Currency used for margin
> notionalCcy	String	Notional value of positions in coin
> notionalUsd	String	Notional value of positions in USD
Get bills details (last 7 days)
Retrieve the bills of the account. The bill refers to all transaction records that result in changing the balance of an account. Pagination is supported, and the response is sorted with the most recent first. This endpoint can retrieve data from the last 7 days.

Rate Limit: 5 requests per second
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/bills

Request Example

GET /api/v5/account/bills

GET /api/v5/account/bills?instType=MARGIN

Request Parameters
Parameter	Type	Required	Description
instType	String	No	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
instId	String	No	Instrument ID, e.g. BTC-USDT
ccy	String	No	Bill currency
mgnMode	String	No	Margin mode
isolated
cross
ctType	String	No	Contract type
linear
inverse
Only applicable to FUTURES/SWAP
type	String	No	Bill type
Please refer to Get bill types for the list of available types.
subType	String	No	Bill subtype
Please refer to Get bill types for the list of available types.
after	String	No	Pagination of data to return records earlier than the requested bill ID.
before	String	No	Pagination of data to return records newer than the requested bill ID.
begin	String	No	Filter with a begin timestamp ts. Unix timestamp format in milliseconds, e.g. 1597026383085
end	String	No	Filter with an end timestamp ts. Unix timestamp format in milliseconds, e.g. 1597026383085
limit	String	No	Number of results per request. The maximum is 100. The default is 100.
Response Example

{
    "code": "0",
    "msg": "",
    "data": [{
        "bal": "8694.2179403378290202",
        "balChg": "0.0219338232210000",
        "billId": "623950854533513219",
        "ccy": "USDT",
        "clOrdId": "",
        "earnAmt": "",
        "earnApr": "",
        "execType": "T",
        "fee": "-0.000021955779",
        "fillFwdPx": "",
        "fillIdxPx": "27104.1",
        "fillMarkPx": "",
        "fillMarkVol": "",
        "fillPxUsd": "",
        "fillPxVol": "",
        "fillTime": "1695033476166",
        "from": "",
        "instId": "BTC-USDT",
        "instType": "SPOT",
        "interest": "0",
        "mgnMode": "isolated",
        "notes": "",
        "ordId": "623950854525124608",
        "pnl": "0",
        "posBal": "0",
        "posBalChg": "0",
        "px": "27105.9",
        "subType": "1",
        "sz": "0.021955779",
        "tag": "",
        "to": "",
        "tradeId": "586760148",
        "ts": "1695033476167",
        "type": "2"
    }]
} 
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
billId	String	Bill ID
type	String	Bill type
subType	String	Bill subtype
ts	String	The time when the balance complete update, Unix timestamp format in milliseconds, e.g.1597026383085
balChg	String	Signed change in account balance for this event, in the currency specified by the ccy field. Positive: balance increased (e.g., received funding fee rebate, closed profitable trade). Negative: balance decreased (e.g., paid trading fee, settled a loss).
posBalChg	String	Change in balance amount at the position level
bal	String	Balance at the account level
posBal	String	Balance at the position level
sz	String	Quantity
For FUTURES/SWAP/OPTION, it is fill quantity or position quantity, the unit is contract. The value is always positive.
For other scenarios. the unit is account balance currency(ccy).
px	String	Price which related to subType
Trade filled price for
1: Buy 2: Sell 3: Open long 4: Open short 5: Close long 6: Close short 204: block trade buy 205: block trade sell 206: block trade open long 207: block trade open short 208: block trade close long 209: block trade close short 114: Forced repayment buy 115: Forced repayment sell
Liquidation Price for
100: Partial liquidation close long 101: Partial liquidation close short 102: Partial liquidation buy 103: Partial liquidation sell 104: Liquidation long 105: Liquidation short 106: Liquidation buy 107: Liquidation sell 16: Repay forcibly 17: Repay interest by borrowing forcibly 110: Liquidation transfer in 111: Liquidation transfer out
Delivery price for
112: Delivery long 113: Delivery short
Exercise price for
170: Exercised 171: Counterparty exercised 172: Expired OTM
Mark price for
173: Funding fee expense 174: Funding fee income
ccy	String	Account balance currency
pnl	String	Profit and loss
fee	String	Fee
Negative number represents the user transaction fee charged by the platform.
Positive number represents rebate.
Trading fee rule
earnAmt	String	Auto earn amount
Only applicable when type is 381
earnApr	String	Auto earn APR
Only applicable when type is 381
mgnMode	String	Margin mode
isolated cross cash
When bills are not generated by trading, the field returns ""
instId	String	Instrument ID, e.g. BTC-USDT
ordId	String	Order ID
Return order ID when the type is 2/5/9
Return "" when there is no order.
execType	String	Liquidity taker or maker
T: taker
M: maker
from	String	The remitting account
6: Funding account
18: Trading account
Only applicable to transfer. When bill type is not transfer, the field returns "".
to	String	The beneficiary account
6: Funding account
18: Trading account
Only applicable to transfer. When bill type is not transfer, the field returns "".
notes	String	Notes
interest	String	Interest
tag	String	Order tag
fillTime	String	Last filled time
tradeId	String	Last traded ID
clOrdId	String	Client Order ID as assigned by the client
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
fillIdxPx	String	Index price at the moment of trade execution
For cross currency spot pairs, it returns baseCcy-USDT index price. For example, for LTC-ETH, this field returns the index price of LTC-USDT.
fillMarkPx	String	Mark price when filled
Applicable to FUTURES/SWAP/OPTIONS, return "" for other instrument types
fillPxVol	String	Implied volatility when filled
Only applicable to options; return "" for other instrument types
fillPxUsd	String	Options price when filled, in the unit of USD
Only applicable to options; return "" for other instrument types
fillMarkVol	String	Mark volatility when filled
Only applicable to options; return "" for other instrument types
fillFwdPx	String	Forward price when filled
Only applicable to options; return "" for other instrument types
 Funding Fee expense (subType = 173)
You may refer to "pnl" for the fee payment
Get bills details (last 3 months)
Retrieve the account’s bills. The bill refers to all transaction records that result in changing the balance of an account. Pagination is supported, and the response is sorted with most recent first. This endpoint can retrieve data from the last 3 months.

Rate Limit: 5 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/bills-archive

Request Example

GET /api/v5/account/bills-archive

GET /api/v5/account/bills-archive?instType=MARGIN

Request Parameters
Parameter	Type	Required	Description
instType	String	No	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
instId	String	No	Instrument ID, e.g. BTC-USDT
ccy	String	No	Bill currency
mgnMode	String	No	Margin mode
isolated
cross
ctType	String	No	Contract type
linear
inverse
Only applicable to FUTURES/SWAP
type	String	No	Bill type
Please refer to Get bill types for the list of available types.
subType	String	No	Bill subtype
Please refer to Get bill types for the list of available types.
after	String	No	Pagination of data to return records earlier than the requested bill ID.
before	String	No	Pagination of data to return records newer than the requested bill ID.
begin	String	No	Filter with a begin timestamp ts. Unix timestamp format in milliseconds, e.g. 1597026383085
end	String	No	Filter with an end timestamp ts. Unix timestamp format in milliseconds, e.g. 1597026383085
limit	String	No	Number of results per request. The maximum is 100. The default is 100.
Response Example

{
    "code": "0",
    "msg": "",
    "data": [{
        "bal": "8694.2179403378290202",
        "balChg": "0.0219338232210000",
        "billId": "623950854533513219",
        "ccy": "USDT",
        "clOrdId": "",
        "earnAmt": "",
        "earnApr": "",
        "execType": "T",
        "fee": "-0.000021955779",
        "fillFwdPx": "",
        "fillIdxPx": "27104.1",
        "fillMarkPx": "",
        "fillMarkVol": "",
        "fillPxUsd": "",
        "fillPxVol": "",
        "fillTime": "1695033476166",
        "from": "",
        "instId": "BTC-USDT",
        "instType": "SPOT",
        "interest": "0",
        "mgnMode": "isolated",
        "notes": "",
        "ordId": "623950854525124608",
        "pnl": "0",
        "posBal": "0",
        "posBalChg": "0",
        "px": "27105.9",
        "subType": "1",
        "sz": "0.021955779",
        "tag": "",
        "to": "",
        "tradeId": "586760148",
        "ts": "1695033476167",
        "type": "2"
    }]
} 
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
billId	String	Bill ID
type	String	Bill type
subType	String	Bill subtype
ts	String	The time when the balance complete update, Unix timestamp format in milliseconds, e.g.1597026383085
balChg	String	Change in balance amount at the account level
posBalChg	String	Change in balance amount at the position level
bal	String	Balance at the account level
posBal	String	Balance at the position level
sz	String	Quantity
For FUTURES/SWAP/OPTION, it is fill quantity or position quantity, the unit is contract. The value is always positive.
For other scenarios. the unit is account balance currency(ccy).
px	String	Price which related to subType
Trade filled price for
1: Buy 2: Sell 3: Open long 4: Open short 5: Close long 6: Close short 204: block trade buy 205: block trade sell 206: block trade open long 207: block trade open short 208: block trade close long 209: block trade close short 114: Forced repayment buy 115: Forced repayment sell
Liquidation Price for
100: Partial liquidation close long 101: Partial liquidation close short 102: Partial liquidation buy 103: Partial liquidation sell 104: Liquidation long 105: Liquidation short 106: Liquidation buy 107: Liquidation sell 16: Repay forcibly 17: Repay interest by borrowing forcibly 110: Liquidation transfer in 111: Liquidation transfer out
Delivery price for
112: Delivery long 113: Delivery short
Exercise price for
170: Exercised 171: Counterparty exercised 172: Expired OTM
Mark price for
173: Funding fee expense 174: Funding fee income
ccy	String	Account balance currency
pnl	String	Profit and loss
fee	String	Fee
Negative number represents the user transaction fee charged by the platform.
Positive number represents rebate.
Trading fee rule
earnAmt	String	Auto earn amount
Only applicable when type is 381
earnApr	String	Auto earn APR
Only applicable when type is 381
mgnMode	String	Margin mode
isolated cross cash
When bills are not generated by trading, the field returns ""
instId	String	Instrument ID, e.g. BTC-USDT
ordId	String	Order ID
Return order ID when the type is 2/5/9
Return "" when there is no order.
execType	String	Liquidity taker or maker
T: taker M: maker
from	String	The remitting account
6: Funding account
18: Trading account
Only applicable to transfer. When bill type is not transfer, the field returns "".
to	String	The beneficiary account
6: Funding account
18: Trading account
Only applicable to transfer. When bill type is not transfer, the field returns "".
notes	String	Notes
interest	String	Interest
tag	String	Order tag
fillTime	String	Last filled time
tradeId	String	Last traded ID
clOrdId	String	Client Order ID as assigned by the client
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
fillIdxPx	String	Index price at the moment of trade execution
For cross currency spot pairs, it returns baseCcy-USDT index price. For example, for LTC-ETH, this field returns the index price of LTC-USDT.
fillMarkPx	String	Mark price when filled
Applicable to FUTURES/SWAP/OPTIONS, return "" for other instrument types
fillPxVol	String	Implied volatility when filled
Only applicable to options; return "" for other instrument types
fillPxUsd	String	Options price when filled, in the unit of USD
Only applicable to options; return "" for other instrument types
fillMarkVol	String	Mark volatility when filled
Only applicable to options; return "" for other instrument types
fillFwdPx	String	Forward price when filled
Only applicable to options; return "" for other instrument types
 Funding Fee expense (subType = 173)
You may refer to "pnl" for the fee payment
Apply bills details (since 2021)
Apply for bill data since 1 February, 2021 except for the current quarter.

Rate Limit：12 requests per day
Rate limit rule: User ID
Permission: Read
HTTP Request
POST /api/v5/account/bills-history-archive

Request Example

POST /api/v5/account/bills-history-archive
body
{
    "year":"2023",
    "quarter":"Q1"
}
Request Parameters
Parameter	Type	Required	Description
year	String	Yes	4 digits year
quarter	String	Yes	Quarter, valid value is Q1, Q2, Q3, Q4
type	String	No	Bill type. Multiple values are supported, separated by commas, e.g. 1,2,3. If not specified, all types are returned.
Please refer to Get bill types for the list of available types.
Response Example

{
    "code": "0",
    "data": [
        {
            "result": "true",
            "ts": "1646892328000"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
result	String	Whether there is already a download link for this section
true: Existed, can check from "Get bills details (since 2021)".
false: Does not exist and is generating, can check the download link after 2 hours
The data of file is in reverse chronological order using billId.
ts	String	The first request time when the server receives. Unix timestamp format in milliseconds, e.g. 1597026383085
 The rule introduction, only applicable to the file generated after 11 October, 2024
1. Taking 2024 Q2 as an example. The date range are [2024-07-01, 2024-10-01). The begin date is included, The end date is excluded.
2. The data of file is in reverse chronological order using `billId`
 Check the file link from the "Get bills details (since 2021)" endpoint in 2 hours to allow for data generation.
During peak demand, data generation may take longer. If the file link is still unavailable after 3 hours, reach out to customer support for assistance.
 It is only applicable to the data from the unified account.
Get bills details (since 2021)
Apply for bill data since 1 February, 2021 except for the current quarter.

Rate Limit: 10 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/bills-history-archive

Response Example

GET /api/v5/account/bills-history-archive?year=2023&quarter=Q4

Request Parameters
Parameter	Type	Required	Description
year	String	Yes	4 digits year
quarter	String	Yes	Quarter, valid value is Q1, Q2, Q3, Q4
type	String	No	Bill type. Multiple values are supported, separated by commas, e.g. 1,2,3. If not specified, all types are returned.
Please refer to Get bill types for the list of available types.
Response Example

{
    "code": "0",
    "data": [
        {
            "fileHref": "http://xxx",
            "state": "finished",
            "ts": "1646892328000"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
fileHref	String	Download file link.
The expiration of every link is 5 and a half hours. If you already apply the files for the same quarter, then it don’t need to apply again within 30 days.
ts	String	The first request time when the server receives. Unix timestamp format in milliseconds, e.g. 1597026383085
state	String	Download link status
"finished" "ongoing" "failed": Failed, please apply again
 It is only applicable to the data from the unified account.
Field descriptions in the decompressed CSV file
Parameter	Type	Description
instType	String	Instrument type
billId	String	Bill ID
subType	String	Bill subtype
ts	String	The time when the balance complete update, Unix timestamp format in milliseconds, e.g.1597026383085
balChg	String	Change in balance amount at the account level
posBalChg	String	Change in balance amount at the position level
bal	String	Balance at the account level
posBal	String	Balance at the position level
sz	String	Quantity
px	String	Price which related to subType
Trade filled price for
1: Buy 2: Sell 3: Open long 4: Open short 5: Close long 6: Close short 204: block trade buy 205: block trade sell 206: block trade open long 207: block trade open short 208: block trade close long 209: block trade close short 114: Forced repayment buy 115: Forced repayment sell
Liquidation Price for
100: Partial liquidation close long 101: Partial liquidation close short 102: Partial liquidation buy 103: Partial liquidation sell 104: Liquidation long 105: Liquidation short 106: Liquidation buy 107: Liquidation sell 16: Repay forcibly 17: Repay interest by borrowing forcibly 110: Liquidation transfer in 111: Liquidation transfer out
Delivery price for
112: Delivery long 113: Delivery short
Exercise price for
170: Exercised 171: Counterparty exercised 172: Expired OTM
Mark price for
173: Funding fee expense 174: Funding fee income
ccy	String	Account balance currency
pnl	String	Profit and loss
fee	String	Fee
Negative number represents the user transaction fee charged by the platform.
Positive number represents rebate.
Trading fee rule
mgnMode	String	Margin mode
isolated cross cash
When bills are not generated by trading, the field returns ""
instId	String	Instrument ID, e.g. BTC-USDT
ordId	String	Order ID
Return order ID when the type is 2/5/9
Return "" when there is no order.
execType	String	Liquidity taker or maker
T: taker M: maker
interest	String	Interest
tag	String	Order tag
fillTime	String	Last filled time
tradeId	String	Last traded ID
clOrdId	String	Client Order ID as assigned by the client
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
fillIdxPx	String	Index price at the moment of trade execution
For cross currency spot pairs, it returns baseCcy-USDT index price. For example, for LTC-ETH, this field returns the index price of LTC-USDT.
fillMarkPx	String	Mark price when filled
Applicable to FUTURES/SWAP/OPTIONS, return "" for other instrument types
fillPxVol	String	Implied volatility when filled
Only applicable to options; return "" for other instrument types
fillPxUsd	String	Options price when filled, in the unit of USD
Only applicable to options; return "" for other instrument types
fillMarkVol	String	Mark volatility when filled
Only applicable to options; return "" for other instrument types
fillFwdPx	String	Forward price when filled
Only applicable to options; return "" for other instrument types
Get bill types
Get all bill types, and the mapping of bill type and subType.

Rate limit: 20 requests per 2 seconds
Rate limit rule: UserId
Permission: Read
HTTP request
GET /api/v5/account/subtypes

Request example

GET /api/v5/account/subtypes
Request parameters
Parameter	Type	Required	Description
type	String	No	Bill type. Multiple values are supported, separated by commas, e.g. 1,2,3. If not specified, all types are returned.
Response example

{
    "code": "0",
    "data": [
        {
            "type": "1",
            "typeDesc": "Transfer",
            "subTypeDetails": [
                {
                    "subType": "11",
                    "subTypeDesc": "Transfer in"
                },
                {
                    "subType": "12",
                    "subTypeDesc": "Transfer out"
                }
            ]
        }
    ],
    "msg": ""
}
Response parameters
Parameter	Type	Description
type	String	Bill type
typeDesc	String	Bill type description, "" means the type is not enabled.
subTypeDetails	Array of objects	Sub-type details
> subType	String	Sub-type
> subTypeDesc	String	Sub-type description, "" means the type is not enabled.
Get account configuration
Retrieve current account configuration.

Rate Limit: 5 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/config

Request Example

GET /api/v5/account/config

Request Parameters
none

Response Example

{
    "code": "0",
    "data": [
        {
            "acctLv": "2",
            "acctStpMode": "cancel_maker",
            "autoLoan": false,
            "ctIsoMode": "automatic",
            "enableSpotBorrow": false,
            "greeksType": "PA",
            "feeType": "0",
            "ip": "",
            "type": "0",
            "kycLv": "3",
            "label": "v5 test",
            "level": "Lv1",
            "levelTmp": "",
            "liquidationGear": "-1",
            "mainUid": "44705892343619584",
            "mgnIsoMode": "automatic",
            "opAuth": "1",
            "perm": "read_only,withdraw,trade",
            "posMode": "long_short_mode",
            "roleType": "0",
            "spotBorrowAutoRepay": false,
            "spotOffsetType": "",
            "spotRoleType": "0",
            "spotTraderInsts": [],
            "stgyType": "0",
            "traderInsts": [],
            "uid": "44705892343619584",
            "settleCcy": "USDC",
            "settleCcyList": ["USD", "USDC", "USDG"]
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
uid	String	Account ID of current request.
mainUid	String	Main Account ID of current request.
The current request account is main account if uid = mainUid.
The current request account is sub-account if uid != mainUid.
acctLv	String	Account mode
1: Spot mode
2: Futures mode
3: Multi-currency margin
4: Portfolio margin
acctStpMode	String	Account self-trade prevention mode
cancel_maker
cancel_taker
cancel_both
The default value is cancel_maker. Users can log in to the webpage through the master account to modify this configuration
posMode	String	Position mode
long_short_mode: long/short, only applicable to FUTURES/SWAP
net_mode: net
autoLoan	Boolean	Whether to borrow coins automatically
true: borrow coins automatically
false: not borrow coins automatically
greeksType	String	Current display type of Greeks
PA: Greeks in coins
BS: Black-Scholes Greeks in dollars
feeType	String	Fee type
0: fee is charged in the currency you receive from the trade
1: fee is always charged in the quote currency of the trading pair
level	String	The user level of the current real trading volume on the platform, e.g Lv1, which means regular user level.
levelTmp	String	Temporary experience user level of special users, e.g Lv1
ctIsoMode	String	Contract isolated margin trading settings
automatic: Auto transfers
autonomy: Manual transfers
mgnIsoMode	String	Margin isolated margin trading settings
auto_transfers_ccy: New auto transfers, enabling both base and quote currency as the margin for isolated margin trading
automatic: Auto transfers
quick_margin: Quick Margin Mode (For new accounts, including subaccounts, some defaults will be automatic, and others will be quick_margin)
spotOffsetType	String	Risk offset type
1: Spot-Derivatives(USDT) to be offsetted
2: Spot-Derivatives(Coin) to be offsetted
3: Only derivatives to be offsetted
Only applicable to Portfolio margin
(Deprecated)
stgyType	String	Strategy type
0: general strategy
1: delta neutral strategy
roleType	String	Role type
0: General user
1: Leading trader
2: Copy trader
traderInsts	Array of strings	Leading trade instruments, only applicable to Leading trader
spotRoleType	String	SPOT copy trading role type.
0: General user；1: Leading trader；2: Copy trader
spotTraderInsts	Array of strings	Spot lead trading instruments, only applicable to lead trader
opAuth	String	Whether the optional trading was activated
0: not activate
1: activated
kycLv	String	Main account KYC level
0: No verification
1: level 1 completed
2: level 2 completed
3: level 3 completed
If the request originates from a subaccount, kycLv is the KYC level of the main account.
If the request originates from the main account, kycLv is the KYC level of the current account.
label	String	API key note of current request API key. No more than 50 letters (case sensitive) or numbers, which can be pure letters or pure numbers.
ip	String	IP addresses that linked with current API key, separate with commas if more than one, e.g. 117.37.203.58,117.37.203.57. It is an empty string "" if there is no IP bonded.
perm	String	The permission of the current requesting API key or Access token
read_only: Read
trade: Trade
withdraw: Withdraw
liquidationGear	String	The maintenance margin ratio level of liquidation alert
3 and -1 means that you will get hourly liquidation alerts on app and channel "Position risk warning" when your margin level drops to or below 300%. -1 is the initial value which has the same effect as -3
0 means that there is not alert
enableSpotBorrow	Boolean	Whether borrow is allowed or not in Spot mode
true: Enabled
false: Disabled
spotBorrowAutoRepay	Boolean	Whether auto-repay is allowed or not in Spot mode
true: Enabled
false: Disabled
type	String	Account type
0: Main account
1: Standard sub-account
2: Managed trading sub-account
5: Custody trading sub-account - Copper
9: Managed trading sub-account - Copper
12: Custody trading sub-account - Komainu
settleCcy	String	Current account's USD-margined contract settle currency
settleCcyList	String	Current account's USD-margined contract settle currency list, like ["USD", "USDC", "USDG"].
Set position mode
Futures mode and Multi-currency mode: FUTURES and SWAP support both long/short mode and net mode. In net mode, users can only have positions in one direction; In long/short mode, users can hold positions in long and short directions.
Portfolio margin mode: FUTURES and SWAP only support net mode

Rate Limit: 5 requests per 2 seconds
Rate limit rule: User ID
Permission: Trade
HTTP Request
POST /api/v5/account/set-position-mode

Request Example

POST /api/v5/account/set-position-mode
body 
{
    "posMode":"long_short_mode"
}

Request Parameters
Parameter	Type	Required	Description
posMode	String	Yes	Position mode
long_short_mode: long/short, only applicable to FUTURES/SWAP
net_mode: net
Response Example

{
    "code": "0",
    "msg": "",
    "data": [{
        "posMode": "long_short_mode"
    }]
}
Response Parameters
Parameter	Type	Description
posMode	String	Position mode
Portfolio margin account only supports net mode

Set leverage

There are 10 different scenarios for leverage setting:

1. Set leverage for MARGIN instruments under isolated-margin trade mode at pairs level.
2. Set leverage for MARGIN instruments under cross-margin trade mode and Spot mode (enabled borrow) at currency level.
3. Set leverage for MARGIN instruments under cross-margin trade mode and Futures mode account mode at pairs level.
4. Set leverage for MARGIN instruments under cross-margin trade mode and Multi-currency margin at currency level.
5. Set leverage for MARGIN instruments under cross-margin trade mode and Portfolio margin at currency level.
6. Set leverage for FUTURES instruments under cross-margin trade mode at underlying level.
7. Set leverage for FUTURES instruments under isolated-margin trade mode and buy/sell position mode at contract level.
8. Set leverage for FUTURES instruments under isolated-margin trade mode and long/short position mode at contract and position side level.
9. Set leverage for SWAP instruments under cross-margin trade at contract level.
10. Set leverage for SWAP instruments under isolated-margin trade mode and buy/sell position mode at contract level.
11. Set leverage for SWAP instruments under isolated-margin trade mode and long/short position mode at contract and position side level.


Note that the request parameter posSide is only required when margin mode is isolated in long/short position mode for FUTURES/SWAP instruments (see scenario 8 and 11 above).
Please refer to the request examples on the right for each case.

Rate limit: 20 requests per 2 seconds
Rate limit rule: User ID
Permission: Trade
HTTP Request
POST /api/v5/account/set-leverage

Request Example

# 1. Set leverage for `MARGIN` instruments under `isolated-margin` trade mode at pairs level.
POST /api/v5/account/set-leverage
body
{
    "instId":"BTC-USDT",
    "lever":"5",
    "mgnMode":"isolated"
}

# 2. Set leverage for `MARGIN` instruments under `cross-margin` trade mode and Spot mode (enabled borrow) at currency level.
POST /api/v5/account/set-leverage
body
{
    "ccy":"BTC",
    "lever":"5",
    "mgnMode":"cross"
}

# 3. Set leverage for `MARGIN` instruments under `cross-margin` trade mode and Futures mode account mode at pairs level.
POST /api/v5/account/set-leverage
body
{
    "instId":"BTC-USDT",
    "lever":"5",
    "mgnMode":"cross"
}

# 4. Set leverage for `MARGIN` instruments under `cross-margin` trade mode and Multi-currency margin at currency level.
POST /api/v5/account/set-leverage
body
{
    "ccy":"BTC",
    "lever":"5",
    "mgnMode":"cross"
}

# 5. Set leverage for `MARGIN` instruments under `cross-margin` trade mode and Portfolio margin at currency level.
POST /api/v5/account/set-leverage
body
{
    "ccy":"BTC",
    "lever":"5",
    "mgnMode":"cross"
}

# 6. Set leverage for `FUTURES` instruments under `cross-margin` trade mode at underlying level.
POST /api/v5/account/set-leverage
body
{
    "instId":"BTC-USDT-200802",
    "lever":"5",
    "mgnMode":"cross"
}

# 7. Set leverage for `FUTURES` instruments under `isolated-margin` trade mode and buy/sell order placement mode at contract level.
POST /api/v5/account/set-leverage
body
{
    "instId":"BTC-USDT-200802",
    "lever":"5",
    "mgnMode":"isolated"
}

# 8. Set leverage for `FUTURES` instruments under `isolated-margin` trade mode and long/short order placement mode at contract and position side level.
POST /api/v5/account/set-leverage
body
{
    "instId":"BTC-USDT-200802",
    "lever":"5",
    "posSide":"long",
    "mgnMode":"isolated"
}

# 9. Set leverage for `SWAP` instruments under `cross-margin` trade at contract level.
POST /api/v5/account/set-leverage
body
{
    "instId":"BTC-USDT-SWAP",
    "lever":"5",
    "mgnMode":"cross"
}

# 10. Set leverage for `SWAP` instruments under `isolated-margin` trade mode and buy/sell order placement mode at contract level.
POST /api/v5/account/set-leverage
body
{
    "instId":"BTC-USDT-SWAP",
    "lever":"5",
    "mgnMode":"isolated"
}

# 11. Set leverage for `SWAP` instruments under `isolated-margin` trade mode and long/short order placement mode at contract and position side level.
POST /api/v5/account/set-leverage
body
{
    "instId":"BTC-USDT-SWAP",
    "lever":"5",
    "posSide":"long",
    "mgnMode":"isolated"
}
Request Parameters
Parameter	Type	Required	Description
instId	String	Conditional	Instrument ID
Only applicable to cross FUTURES SWAP of Spot mode/Multi-currency margin/Portfolio margin, cross MARGINFUTURESSWAP and isolated position.
And required in applicable scenarios.
ccy	String	Conditional	Currency used for margin, used for the leverage setting for the currency in auto borrow.
Only applicable to cross MARGIN of Spot mode/Multi-currency margin/Portfolio margin.
And required in applicable scenarios.
lever	String	Yes	Leverage
mgnMode	String	Yes	Margin mode
isolated cross
Can only be cross if ccy is passed.
posSide	String	Conditional	Position side
long short
Only required when margin mode is isolated in long/short mode for FUTURES/SWAP.
Response Example

{
  "code": "0",
  "msg": "",
  "data": [
    {
      "lever": "30",
      "mgnMode": "isolated",
      "instId": "BTC-USDT-SWAP",
      "posSide": "long"
    }
  ]
}
Response Parameters
Parameter	Type	Description
lever	String	Leverage
mgnMode	String	Margin mode
cross isolated
instId	String	Instrument ID
posSide	String	Position side
 When setting leverage for `cross` `FUTURES`/`SWAP` at the underlying level, pass in any instId and mgnMode(`cross`).
 Leverage cannot be adjusted for the cross positions of Expiry Futures and Perpetual Futures under the portfolio margin account.
Get maximum order quantity
The maximum quantity to buy or sell. It corresponds to the "sz" from placement.

 Under the Portfolio Margin account, the calculation of the maximum buy/sell amount or open amount is not supported under the cross mode of derivatives.
Rate Limit: 20 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/max-size

Request Example

GET /api/v5/account/max-size?instId=BTC-USDT&tdMode=isolated

Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Single instrument or multiple instruments (no more than 5) in the same instrument type separated with comma, e.g. BTC-USDT,ETH-USDT
tdMode	String	Yes	Trade mode
cross
isolated
cash
spot_isolated: only applicable to Futures mode.
ccy	String	Conditional	Currency used for margin
Applicable to isolated MARGIN and cross MARGIN orders in Futures mode.
px	String	No	Price
When the price is not specified, it will be calculated according to the current limit price for FUTURES and SWAP, the last traded price for other instrument types.
The parameter will be ignored when multiple instruments are specified.
leverage	String	No	Leverage for instrument
The default is current leverage
Only applicable to MARGIN/FUTURES/SWAP
tradeQuoteCcy	String	No	The quote currency used for trading. Only applicable to SPOT.
The default value is the quote currency of the instId, for example: for BTC-USD, the default is USD.
Response Example

{
    "code": "0",
    "msg": "",
    "data": [{
        "ccy": "BTC",
        "instId": "BTC-USDT",
        "maxBuy": "0.0500695098559788",
        "maxSell": "64.4798671570072269"
  }]
}
Response Parameters
Parameter	Type	Description
instId	String	Instrument ID
ccy	String	Currency used for margin
maxBuy	String	SPOT/MARGIN: The maximum quantity in base currency that you can buy
The cross-margin order under Futures mode mode, quantity of coins is based on base currency.
FUTURES/SWAP/OPTIONS: The maximum quantity of contracts that you can buy
maxSell	String	SPOT/MARGIN: The maximum quantity in quote currency that you can sell
The cross-margin order under Futures mode mode, quantity of coins is based on base currency.
FUTURES/SWAP/OPTIONS: The maximum quantity of contracts that you can sell
Get maximum available balance/equity
Available balance for isolated margin positions and SPOT, available equity for cross margin positions.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/max-avail-size

Request Example

# Query maximum available transaction amount when cross MARGIN BTC-USDT use BTC as margin
GET /api/v5/account/max-avail-size?instId=BTC-USDT&tdMode=cross&ccy=BTC

# Query maximum available transaction amount for SPOT BTC-USDT
GET /api/v5/account/max-avail-size?instId=BTC-USDT&tdMode=cash

Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Single instrument or multiple instruments (no more than 5) separated with comma, e.g. BTC-USDT,ETH-USDT
ccy	String	Conditional	Currency used for margin
Applicable to isolated MARGIN and cross MARGIN in Futures mode.
tdMode	String	Yes	Trade mode
cross
isolated
cash
spot_isolated: only applicable to Futures mode
reduceOnly	Boolean	No	Whether to reduce position only
Only applicable to MARGIN
px	String	No	The price of closing position.
Only applicable to reduceOnly MARGIN.
tradeQuoteCcy	String	No	The quote currency used for trading. Only applicable to SPOT.
The default value is the quote currency of the instId, for example: for BTC-USD, the default is USD.
Response Example

{
  "code": "0",
  "msg": "",
  "data": [
    {
      "instId": "BTC-USDT",
      "availBuy": "100",
      "availSell": "1"
    }
  ]
}
Response Parameters
Parameter	Type	Description
instId	String	Instrument ID
availBuy	String	Maximum available balance/equity to buy
availSell	String	Maximum available balance/equity to sell
 In the case of SPOT/MARGIN, availBuy is in the quote currency, and availSell is in the base currency.
In the case of MARGIN with cross tdMode, both availBuy and availSell are in the currency passed in ccy.
Increase/decrease margin
Increase or decrease the margin of the isolated position. Margin reduction may result in the change of the actual leverage.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: User ID
Permission: Trade
HTTP Request
POST /api/v5/account/position/margin-balance

Request Example

POST /api/v5/account/position/margin-balance 
body
{
    "instId":"BTC-USDT-200626",
    "posSide":"short",
    "type":"add",
    "amt":"1"
}

Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID
posSide	String	Yes	Position side, the default is net
long
short
net
type	String	Yes	add: add margin
reduce: reduce margin
amt	String	Yes	Amount to be increased or decreased.
ccy	String	Conditional	Currency
Applicable to isolated MARGIN orders
Response Example

{
    "code": "0",
    "msg": "",
    "data": [{
            "amt": "0.3",
            "ccy": "BTC",
            "instId": "BTC-USDT",
            "leverage": "",
            "posSide": "net",
            "type": "add"
        }]
}
Response Parameters
Parameter	Type	Description
instId	String	Instrument ID
posSide	String	Position side, long short
amt	String	Amount to be increase or decrease
type	String	add: add margin
reduce: reduce margin
leverage	String	Real leverage after the margin adjustment
ccy	String	Currency
 Manual transfer mode
The value of the margin initially assigned to the isolated position must be greater than or equal to 10,000 USDT, and a position will be created on the account.
Get leverage
Rate Limit: 20 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/leverage-info

Request Example

GET /api/v5/account/leverage-info?instId=BTC-USDT-SWAP&mgnMode=cross

Request Parameters
Parameter	Type	Required	Description
instId	String	Conditional	Instrument ID
Single instrument ID or multiple instrument IDs (no more than 20) separated with comma
ccy	String	Conditional	Currency，used for getting leverage of currency level.
Applicable to cross MARGIN of Spot mode/Multi-currency margin/Portfolio margin.
Supported single currency or multiple currencies (no more than 20) separated with comma.
mgnMode	String	Yes	Margin mode
cross isolated
Response Example

{
    "code": "0",
    "msg": "",
    "data": [{
        "ccy":"",
        "instId": "BTC-USDT-SWAP",
        "mgnMode": "cross",
        "posSide": "long",
        "lever": "10"
    },{
        "ccy":"",
        "instId": "BTC-USDT-SWAP",
        "mgnMode": "cross",
        "posSide": "short",
        "lever": "10"
    }]
}
Response Parameters
Parameter	Type	Description
instId	String	Instrument ID
ccy	String	Currency，used for getting leverage of currency level.
Applicable to cross MARGIN of Spot mode/Multi-currency margin/Portfolio margin.
mgnMode	String	Margin mode
posSide	String	Position side
long
short
net
In long/short mode, the leverage in both directions long/short will be returned.
lever	String	Leverage
 Leverage cannot be enquired for the cross positions of Expiry Futures and Perpetual Futures under the portfolio margin account.
Get leverage estimated info
Rate Limit: 5 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/adjust-leverage-info

Request Example

GET /api/v5/account/adjust-leverage-info?instType=MARGIN&mgnMode=isolated&lever=3&instId=BTC-USDT

Request Parameters
Parameter	Type	Required	Description
instType	String	Yes	Instrument type
MARGIN
SWAP
FUTURES
mgnMode	String	Yes	Margin mode
isolated
cross
lever	String	Yes	Leverage
instId	String	Conditional	Instrument ID, e.g. BTC-USDT
It is required for these scenarioes: SWAP and FUTURES, Margin isolation, Margin cross in Futures mode.
ccy	String	Conditional	Currency used for margin, e.g. BTC
It is required for isolated margin and cross margin in Futures mode, Multi-currency margin and Portfolio margin
posSide	String	No	posSide
net: The default value
long
short
Response Example

{
    "code": "0",
    "data": [
        {
            "estAvailQuoteTrans": "",
            "estAvailTrans": "1.1398040558348279",
            "estLiqPx": "",
            "estMaxAmt": "10.6095865868904898",
            "estMgn": "0.0701959441651721",
            "estQuoteMaxAmt": "176889.6871254563042714",
            "estQuoteMgn": "",
            "existOrd": false,
            "maxLever": "10",
            "minLever": "0.01"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
estAvailQuoteTrans	String	The estimated margin(in quote currency) can be transferred out under the corresponding leverage
For cross, it is the maximum quantity that can be transferred from the trading account.
For isolated, it is the maximum quantity that can be transferred from the isolated position
Only applicable to MARGIN
estAvailTrans	String	The estimated margin can be transferred out under the corresponding leverage.
For cross, it is the maximum quantity that can be transferred from the trading account.
For isolated, it is the maximum quantity that can be transferred from the isolated position
The unit is base currency for MARGIN
It is not applicable to the scenario when increasing leverage for isolated position under FUTURES and SWAP
estLiqPx	String	The estimated liquidation price under the corresponding leverage. Only return when there is a position.
estMgn	String	The estimated margin needed by position under the corresponding leverage.
For the MARGIN position, it is margin in base currency
estQuoteMgn	String	The estimated margin (in quote currency) needed by position under the corresponding leverage
estMaxAmt	String	For MARGIN, it is the estimated maximum loan in base currency under the corresponding leverage
For SWAP and FUTURES, it is the estimated maximum quantity of contracts that can be opened under the corresponding leverage
estQuoteMaxAmt	String	The MARGIN estimated maximum loan in quote currency under the corresponding leverage.
existOrd	Boolean	Whether there is pending orders
true
false
maxLever	String	Maximum leverage
minLever	String	Minimum leverage
Get the maximum loan of instrument
Rate Limit: 20 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/max-loan

Request Example

# Max loan of cross `MARGIN` for currencies of trading pair in `Spot mode` (enabled borrowing)
GET  /api/v5/account/max-loan?instId=BTC-USDT&mgnMode=cross

# Max loan for currency in `Spot mode` (enabled borrowing)
GET  /api/v5/account/max-loan?ccy=USDT&mgnMode=cross

# Max loan of isolated `MARGIN` in `Futures mode`
GET  /api/v5/account/max-loan?instId=BTC-USDT&mgnMode=isolated

# Max loan of cross `MARGIN` in `Futures mode` (Margin Currency is BTC)
GET  /api/v5/account/max-loan?instId=BTC-USDT&mgnMode=cross&mgnCcy=BTC

# Max loan of cross `MARGIN` in `Multi-currency margin`
GET  /api/v5/account/max-loan?instId=BTC-USDT&mgnMode=cross

Request Parameters
Parameter	Type	Required	Description
mgnMode	String	Yes	Margin mode
isolated cross
instId	String	Conditional	Single instrument or multiple instruments (no more than 5) separated with comma, e.g. BTC-USDT,ETH-USDT
ccy	String	Conditional	Currency
Applicable to get Max loan of manual borrow for the currency in Spot mode (enabled borrowing)
mgnCcy	String	Conditional	Margin currency
Applicable to isolated MARGIN and cross MARGIN in Futures mode.
tradeQuoteCcy	String	No	The quote currency for trading. Only applicable to SPOT.
The default value is the quote currency of instId, e.g. USD for BTC-USD.
Response Example

{
  "code": "0",
  "msg": "",
  "data": [
    {
      "instId": "BTC-USDT",
      "mgnMode": "isolated",
      "mgnCcy": "",
      "maxLoan": "0.1",
      "ccy": "BTC",
      "side": "sell"
    },
    {
      "instId": "BTC-USDT",
      "mgnMode": "isolated",
      "mgnCcy": "",
      "maxLoan": "0.2",
      "ccy": "USDT",
      "side": "buy"
    }
  ]
}
Response Parameters
Parameter	Type	Description
instId	String	Instrument ID
mgnMode	String	Margin mode
mgnCcy	String	Margin currency
maxLoan	String	Max loan
ccy	String	Currency
side	String	Order side
buy sell
Get fee rates
Rate Limit: 5 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/trade-fee

Request Example

# Query trade fee rate of SPOT BTC-USDT
GET /api/v5/account/trade-fee?instType=SPOT&instId=BTC-USDT
Request Parameters
Parameter	Type	Required	Description
instType	String	Yes	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
instId	String	No	Instrument ID, e.g. BTC-USDT
Applicable to SPOT/MARGIN
instFamily	String	No	Instrument family, e.g. BTC-USD
Applicable to FUTURES/SWAP/OPTION
groupId	String	No	Instrument trading fee group ID
Only one of groupId and instId/instFamily can be passed in

Users can use instruments endpoint to fetch the mapping of an instrument ID and its trading fee group ID
Response Example

{
    "code": "0",
    "data": [
        {
            "category": "1",
            "delivery": "",
            "exercise": "",
            "feeGroup": [
                {
                    "groupId": "1",
                    "maker": "-0.0008",
                    "taker": "-0.001"
                }
            ],
            "fiat": [],
            "instType": "SPOT",
            "level": "Lv1",
            "maker": "-0.0008",
            "makerU": "",
            "makerUSDC": "",
            "ruleType": "normal",
            "taker": "-0.001",
            "takerU": "",
            "takerUSDC": "",
            "ts": "1763979985847"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
level	String	Fee rate Level
feeGroup	Array of objects	Fee groups.
Applicable to SPOT/MARGIN/SWAP/FUTURES/OPTION
> taker	String	Taker fee
> maker	String	Maker fee
> groupId	String	Instrument trading fee group ID

instType and groupId should be used together to determine a trading fee group. Users should use this endpoint together with instruments endpoint to get the trading fee of a specific symbol.
delivery	String	Delivery fee rate
exercise	String	Fee rate for exercising the option
instType	String	Instrument type
ts	String	Data return time, Unix timestamp format in milliseconds, e.g. 1597026383085
taker	String	For SPOT/MARGIN, it is taker fee rate of the USDT trading pairs.
For FUTURES/SWAP/OPTION, it is the fee rate of crypto-margined contracts(deprecated)
maker	String	For SPOT/MARGIN, it is maker fee rate of the USDT trading pairs.
For FUTURES/SWAP/OPTION, it is the fee rate of crypto-margined contracts(deprecated)
takerU	String	Taker fee rate of USDT-margined contracts, only applicable to FUTURES/SWAP(deprecated)
makerU	String	Maker fee rate of USDT-margined contracts, only applicable to FUTURES/SWAP(deprecated)
takerUSDC	String	For SPOT/MARGIN, it is taker fee rate of the USDⓈ&Crypto trading pairs.
For FUTURES/SWAP, it is the fee rate of USDC-margined contracts(deprecated)
makerUSDC	String	For SPOT/MARGIN, it is maker fee rate of the USDⓈ&Crypto trading pairs.
For FUTURES/SWAP, it is the fee rate of USDC-margined contracts(deprecated)
ruleType	String	Trading rule types
normal: normal trading
pre_market: pre-market trading(deprecated)
category	String	Currency category.(deprecated)
fiat	Array of objects	Details of fiat fee rate(deprecated)
> ccy	String	Fiat currency.
> taker	String	Taker fee rate
> maker	String	Maker fee rate
 Remarks:
The fee rate like maker and taker: positive number, which means the rate of rebate; negative number, which means the rate of commission.
Exception: The values for delivery and exercise are positive numbers, representing the commission rate.
 USDⓈ represent the stablecoin besides USDT
 The Open API will not reflect zero-fee trading. For zero-fee pairs, please refer to https://www.okx.com/fees .
Get interest accrued data
Get the interest accrued data for the past year

Rate Limit: 5 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/interest-accrued

Request Example

GET /api/v5/account/interest-accrued

Request Parameters
Parameter	Type	Required	Description
type	String	No	Loan type
2: Market loans
Default is 2
ccy	String	No	Loan currency, e.g. BTC
Only applicable to Market loans
Only applicable toMARGIN
instId	String	No	Instrument ID, e.g. BTC-USDT
Only applicable to Market loans
mgnMode	String	No	Margin mode
cross
isolated
Only applicable to Market loans
after	String	No	Pagination of data to return records earlier than the requested timestamp, Unix timestamp format in milliseconds, e.g. 1597026383085
before	String	No	Pagination of data to return records newer than the requested, Unix timestamp format in milliseconds, e.g. 1597026383085
limit	String	No	Number of results per request. The maximum is 100. The default is 100.
Response Example

{
    "code": "0",
    "data": [
        {
            "ccy": "USDT",
            "instId": "",
            "interest": "0.0003960833333334",
            "interestRate": "0.0000040833333333",
            "liab": "97",
            "totalLiab": "",
            "interestFreeLiab": "",
            "mgnMode": "",
            "ts": "1637312400000",
            "type": "1"
        },
        {
            "ccy": "USDT",
            "instId": "",
            "interest": "0.0004083333333334",
            "interestRate": "0.0000040833333333",
            "liab": "100",
            "mgnMode": "",
            "ts": "1637049600000",
            "type": "1"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
type	String	Loan type
2: Market loans
ccy	String	Loan currency, e.g. BTC
instId	String	Instrument ID, e.g. BTC-USDT
Only applicable to Market loans
mgnMode	String	Margin mode
cross
isolated
interest	String	Interest accrued
interestRate	String	Hourly borrowing interest rate
liab	String	Liability
totalLiab	String	Total liability for current account
interestFreeLiab	String	Interest-free liability for current account
ts	String	Timestamp for interest accrued, Unix timestamp format in milliseconds, e.g. 1597026383085
Get interest rate
Get the user's current leveraged currency borrowing market interest rate

Rate Limit: 5 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/interest-rate

Request Example

GET /api/v5/account/interest-rate
Request Parameters
Parameters	Types	Required	Description
ccy	String	No	Currency, e.g. BTC
{
    "code":"0",
    "msg":"",
    "data":[
        {
            "ccy":"BTC",
            "interestRate":"0.0001"
        },
        {
            "ccy":"LTC",
            "interestRate":"0.0003"
        }
    ]
}
Response Parameters
Parameter	Type	Description
interestRate	String	Hourly borrowing interest rate
ccy	String	Currency
Get maximum withdrawals
Retrieve the maximum transferable amount from trading account to funding account. If no currency is specified, the transferable amount of all owned currencies will be returned.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/max-withdrawal

Request Example

GET /api/v5/account/max-withdrawal

Request Parameters
Parameter	Type	Required	Description
ccy	String	No	Single currency or multiple currencies (no more than 20) separated with comma, e.g. BTC or BTC,ETH.
Response Example

{
    "code": "0",
    "msg": "",
    "data": [{
            "ccy": "BTC",
            "maxWd": "124",
            "maxWdEx": "125",
            "spotOffsetMaxWd": "",
            "spotOffsetMaxWdEx": ""
        },
        {
            "ccy": "ETH",
            "maxWd": "10",
            "maxWdEx": "12",
            "spotOffsetMaxWd": "",
            "spotOffsetMaxWdEx": ""
        }
    ]
}
Response Parameters
Parameter	Type	Description
ccy	String	Currency
maxWd	String	Max withdrawal (excluding borrowed assets under Spot mode/Multi-currency margin/Portfolio margin)
maxWdEx	String	Max withdrawal (including borrowed assets under Spot mode/Multi-currency margin/Portfolio margin)
spotOffsetMaxWd	String	Max withdrawal under Spot-Derivatives risk offset mode (excluding borrowed assets under Portfolio margin)
Applicable to Portfolio margin
spotOffsetMaxWdEx	String	Max withdrawal under Spot-Derivatives risk offset mode (including borrowed assets under Portfolio margin)
Applicable to Portfolio margin
Get borrow interest and limit
Rate Limit: 5 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/interest-limits

Request Example

GET /api/v5/account/interest-limits?ccy=BTC

Request Parameters
Parameter	Type	Required	Description
type	String	No	Loan type
2: Market loans
Default is 2
ccy	String	No	Loan currency, e.g. BTC
Response Example

{
    "code": "0",
    "data": [
        {
            "debt": "0.85893159114900247077000000000000",
            "interest": "0.00000000000000000000000000000000",
            "loanAlloc": "",
            "nextDiscountTime": "1729490400000",
            "nextInterestTime": "1729490400000",
            "records": [
                {
                    "availLoan": "",
                    "avgRate": "",
                    "ccy": "BTC",
                    "interest": "0",
                    "loanQuota": "175.00000000",
                    "posLoan": "",
                    "rate": "0.0000276",
                    "surplusLmt": "175.00000000",
                    "surplusLmtDetails": {},
                    "usedLmt": "0.00000000",
                    "usedLoan": "",
                    "interestFreeLiab": "",
                    "potentialBorrowingAmt": ""
                }
            ]
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
debt	String	Current debt in USD
interest	String	Current interest in USD, the unit is USD
Only applicable to Market loans
nextDiscountTime	String	Next deduct time, Unix timestamp format in milliseconds, e.g. 1597026383085
nextInterestTime	String	Next accrual time, Unix timestamp format in milliseconds, e.g. 1597026383085
loanAlloc	String	VIP Loan allocation for the current trading account
1. The unit is percent(%). Range is [0, 100]. Precision is 0.01%
2. If master account did not assign anything, then "0"
3. "" if shared between master and sub-account
records	Array of objects	Details for currencies
> ccy	String	Loan currency, e.g. BTC
> rate	String	Current daily borrowing rate
> loanQuota	String	Borrow limit of master account
If loan allocation has been assigned, then it is the borrow limit of the current trading account
> surplusLmt	String	Available amount across all sub-accounts
If loan allocation has been assigned, then it is the available amount to borrow by the current trading account
> usedLmt	String	Borrowed amount for current account
If loan allocation has been assigned, then it is the borrowed amount by the current trading account
> interest	String	Interest to be deducted
Only applicable to Market loans
> interestFreeLiab	String	Interest-free liability for current account
> potentialBorrowingAmt	String	Potential borrowing amount for current account
> surplusLmtDetails	Object	The details of available amount across all sub-accounts
The value of surplusLmt is the minimum value within this array. It can help you judge the reason that surplusLmt is not enough.
Only applicable to VIP loansDeprecated
>> allAcctRemainingQuota	String	Total remaining quota for master account and sub-accounts Deprecated
>> curAcctRemainingQuota	String	The remaining quota for the current account.
Only applicable to the case in which the sub-account is assigned the loan allocationDeprecated
>> platRemainingQuota	String	Remaining quota for the platform.
The format like "600" will be returned when it is more than curAcctRemainingQuota or allAcctRemainingQuotaDeprecated
> posLoan	String	Frozen amount for current account (Within the locked quota)
Only applicable to VIP loansDeprecated
> availLoan	String	Available amount for current account (Within the locked quota)
Only applicable to VIP loansDeprecated
> usedLoan	String	Borrowed amount for current account
Only applicable to VIP loansDeprecated
> avgRate	String	Average hourly interest of borrowed coin
only applicable to VIP loansDeprecated
Manual borrow / repay
Only applicable to Spot mode (enabled borrowing)

Rate Limit: 1 request per second
Rate limit rule: Master Account User ID
Permission: Trade
HTTP Request
POST /api/v5/account/spot-manual-borrow-repay

Request Example

POST /api/v5/account/spot-manual-borrow-repay 
body
{
    "ccy":"USDT",
    "side":"borrow",
    "amt":"100"
}
Request Parameters
Parameter	Type	Required	Description
ccy	String	Yes	Currency, e.g. BTC
side	String	Yes	Side
borrow
repay
amt	String	Yes	Amount
Response Example

{
    "code": "0",
    "data": [
        {
            "ccy":"USDT",
            "side":"borrow",
            "amt":"100"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
ccy	String	Currency, e.g. BTC
side	String	Side
borrow
repay
amt	String	Actual amount
Set auto repay
Only applicable to Spot mode (enabled borrowing)

Rate Limit: 5 requests per 2 seconds
Rate limit rule: User ID
Permission: Trade
HTTP Request
POST /api/v5/account/set-auto-repay

Request Example

POST /api/v5/account/set-auto-repay
body
{
    "autoRepay": true
}
Request Parameters
Parameter	Type	Required	Description
autoRepay	Boolean	Yes	Whether auto repay is allowed or not under Spot mode
true: Enable auto repay
false: Disable auto repay
Response Example

{
    "code": "0",
    "msg": "",
    "data": [
        {
            "autoRepay": true
        }
    ]
}
Response Parameters
Parameter	Type	Description
autoRepay	Boolean	Whether auto repay is allowed or not under Spot mode
true: Enable auto repay
false: Disable auto repay
Get borrow/repay history
Retrieve the borrow/repay history under Spot mode

Rate Limit: 5 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/account/spot-borrow-repay-history

Request Example

GET /api/v5/account/spot-borrow-repay-history
Request Parameters
Parameter	Type	Required	Description
ccy	String	No	Currency, e.g. BTC
type	String	No	Event type
auto_borrow
auto_repay
manual_borrow
manual_repay
after	String	No	Pagination of data to return records earlier than the requested ts (included), Unix timestamp format in milliseconds, e.g. 1597026383085
before	String	No	Pagination of data to return records newer than the requested ts(included), Unix timestamp format in milliseconds, e.g. 1597026383085
limit	String	No	Number of results per request. The maximum is 100. The default is 100.
Response Example

{
    "code": "0",
    "data": [
        {
            "accBorrowed": "0",
            "amt": "6764.802661157592",
            "ccy": "USDT",
            "ts": "1725330976644",
            "type": "auto_repay"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
ccy	String	Currency, e.g. BTC
type	String	Event type
auto_borrow
auto_repay
manual_borrow
manual_repay
amt	String	Amount
accBorrowed	String	Accumulated borrow amount
ts	String	Timestamp for the event, Unix timestamp format in milliseconds, e.g. 1597026383085
WebSocket
Account channel
Retrieve account information. Data will be pushed when triggered by events such as placing order, canceling order, transaction execution, etc. It will also be pushed in regular interval according to subscription granularity.

Concurrent connection to this channel will be restricted by the following rules: WebSocket connection count limit.

URL Path
/ws/v5/private (required login)

Request Example : single

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "account",
      "ccy": "BTC"
    }
  ]
}
Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "account",
      "extraParams": "
        {
          \"updateInterval\": \"0\"
        }
      "
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
account
> ccy	String	No	Currency
> extraParams	String	No	Additional configuration
>> updateInterval	int	No	0: only push due to account events
The data will be pushed both by events and regularly if this field is omitted or set to other values than 0.
The following format should be strictly obeyed when using this field.
"extraParams": "
{
\"updateInterval\": \"0\"
}
"
Successful Response Example : single

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "account",
    "ccy": "BTC"
  },
  "connId": "a4d3ae55"
}
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "account"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"account\", \"ccy\" : \"BTC\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Operation
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
account
> ccy	String	No	Currency
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
    "arg": {
        "channel": "account",
        "uid": "44*********584"
    },
    "eventType": "snapshot",
    "curPage": 1,
    "lastPage": true,
    "data": [{
        "adjEq": "55444.12216906034",
    "availEq": "55444.12216906034",
        "borrowFroz": "0",
    "delta": "0",
    "deltaLever": "0",
    "deltaNeutralStatus": "0",
        "details": [{
        "availBal": "4734.371190691436",
        "availEq": "4734.371190691435",
        "borrowFroz": "0",
        "cashBal": "4750.426970691436",
        "ccy": "USDT",
        "coinUsdPrice": "0.99927",
        "crossLiab": "0",
        "colRes": "0",
        "collateralEnabled": false,
        "collateralRestrict": false, // Deprecated, use colRes instead
        "colBorrAutoConversion": "0",
        "disEq": "4889.379316336831",
        "eq": "4892.951170691435",
        "eqUsd": "4889.379316336831",
        "smtSyncEq": "0",
        "spotCopyTradingEq": "0",
        "fixedBal": "0",
        "frozenBal": "158.57998",
        "frpType": "0",
        "imr": "",
        "interest": "0",
        "isoEq": "0",
        "isoLiab": "0",
        "isoUpl": "0",
        "liab": "0",
        "maxLoan": "0",
        "mgnRatio": "",
        "mmr": "",
        "notionalLever": "",
        "ordFrozen": "0",
        "rewardBal": "0",
        "spotInUseAmt": "",
        "clSpotInUseAmt": "",
        "maxSpotInUseAmt": "",          
        "spotIsoBal": "0",
        "stgyEq": "150",
        "twap": "0",
        "uTime": "1705564213903",
        "upl": "-7.475800000000003",
        "uplLiab": "0",
        "spotBal": "",
        "openAvgPx": "",
        "accAvgPx": "",
        "spotUpl": "",
        "spotUplRatio": "",
        "totalPnl": "",
        "totalPnlRatio": ""
        }],
        "imr": "0",
        "isoEq": "0",
        "mgnRatio": "",
        "mmr": "0",
        "notionalUsd": "0",
        "notionalUsdForBorrow": "0",
        "notionalUsdForFutures": "0",
        "notionalUsdForOption": "0",
        "notionalUsdForSwap": "0",
        "ordFroz": "0",
        "totalEq": "55868.06403501676",
        "uTime": "1705564223311",
        "upl": "0"
    }]
}
Push data parameters
Parameters	Types	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> uid	String	User Identifier
eventType	String	Event type:
snapshot: Initial and regular snapshot push
event_update: Event-driven update push
curPage	Integer	Current page number.
Only applicable for snapshot events. Not included in event_update events.
lastPage	Boolean	Whether this is the last page of pagination:
true
false
Only applicable for snapshot events. Not included in event_update events.
data	Array of objects	Subscribed data
> uTime	String	The latest time to get account information, millisecond format of Unix timestamp, e.g. 1597026383085
> totalEq	String	The total amount of equity in USD
> isoEq	String	Isolated margin equity in USD
Applicable to Futures mode/Multi-currency margin/Portfolio margin
> adjEq	String	Adjusted / Effective equity in USD
The net fiat value of the assets in the account that can provide margins for spot, expiry futures, perpetual futures and options under the cross-margin mode.
In multi-ccy or PM mode, the asset and margin requirement will all be converted to USD value to process the order check or liquidation.
Due to the volatility of each currency market, our platform calculates the actual USD value of each currency based on discount rates to balance market risks.
Applicable to Spot mode/Multi-currency margin/Portfolio margin
> availEq	String	Account level available equity, excluding currencies that are restricted due to the collateralized borrowing limit.
Applicable to Multi-currency margin/Portfolio margin
> ordFroz	String	Margin frozen for pending cross orders in USD
Only applicable to Spot mode/Multi-currency margin/Portfolio margin
> imr	String	Initial margin requirement in USD
The sum of initial margins of all open positions and pending orders under cross-margin mode in USD.
Applicable to Spot mode/Multi-currency margin/Portfolio margin
> mmr	String	Maintenance margin requirement in USD
The sum of maintenance margins of all open positions and pending orders under cross-margin mode in USD.
Applicable to Spot mode/Multi-currency margin/Portfolio margin
> borrowFroz	String	Potential borrowing IMR of the account in USD
Only applicable to Spot mode/Multi-currency margin/Portfolio margin. It is "" for other margin modes.
> mgnRatio	String	Maintenance margin ratio in USD.
Applicable to Spot mode/Multi-currency margin/Portfolio margin
> notionalUsd	String	Notional value of positions in USD
Applicable to Spot mode/Multi-currency margin/Portfolio margin
> notionalUsdForBorrow	String	Notional value for Borrow in USD
Applicable to Spot mode/Multi-currency margin/Portfolio margin
> notionalUsdForSwap	String	Notional value of positions for Perpetual Futures in USD
Applicable to Multi-currency margin/Portfolio margin
> notionalUsdForFutures	String	Notional value of positions for Expiry Futures in USD
Applicable to Multi-currency margin/Portfolio margin
> notionalUsdForOption	String	Notional value of positions for Option in USD
Applicable to Spot mode/Multi-currency margin/Portfolio margin
> upl	String	Cross-margin info of unrealized profit and loss at the account level in USD
Applicable to Multi-currency margin/Portfolio margin
> delta	String	Delta (USD)
> deltaLever	String	Delta neutral strategy account level delta leverage
deltaLever = delta / totalEq
> deltaNeutralStatus	String	Delta risk status
0: normal
1: transfer restricted
2: delta reducing - cancel all pending orders if delta is greater than 5000 USD, only one delta reducing order allowed per index (spot, futures, swap)
> details	Array of objects	Detailed asset information in all currencies
>> ccy	String	Currency
>> eq	String	Equity of currency
>> cashBal	String	Cash balance
>> uTime	String	Update time, Unix timestamp format in milliseconds, e.g. 1597026383085
>> isoEq	String	Isolated margin equity of currency
Applicable to Futures mode/Multi-currency margin/Portfolio margin
>> availEq	String	Available equity of currency
Applicable to Futures mode/Multi-currency margin/Portfolio margin
>> disEq	String	Discount equity of currency in USD.
Applicable to Spot mode(enabled spot borrow)/Multi-currency margin/Portfolio margin
>> fixedBal	String	Frozen balance for Dip Sniper and Peak Sniper
>> availBal	String	Available balance of currency
>> frozenBal	String	Frozen balance of currency
>> ordFrozen	String	Margin frozen for open orders
Applicable to Spot mode/Futures mode/Multi-currency margin
>> liab	String	Liabilities of currency
It is a positive value, e.g. 21625.64.
Applicable to Spot mode/Multi-currency margin/Portfolio margin
>> upl	String	The sum of the unrealized profit & loss of all margin and derivatives positions of currency.
Applicable to Futures mode/Multi-currency margin/Portfolio margin
>> uplLiab	String	Liabilities due to Unrealized loss of currency
Applicable to Multi-currency margin/Portfolio margin
>> crossLiab	String	Cross liabilities of currency
Applicable to Spot mode/Multi-currency margin/Portfolio margin
>> isoLiab	String	Isolated liabilities of currency
Applicable to Multi-currency margin/Portfolio margin
>> rewardBal	String	Trial fund balance
>> mgnRatio	String	Cross maintenance margin ratio of currency
The index for measuring the risk of a certain asset in the account.
Applicable to Futures mode and when there is cross position
>> imr	String	Cross initial margin requirement at the currency level
Applicable to Futures mode and when there is cross position
>> mmr	String	Cross maintenance margin requirement at the currency level
Applicable to Futures mode and when there is cross position
>> interest	String	Interest of currency
It is a positive value, e.g."9.01". Applicable to Spot mode/Multi-currency margin/Portfolio margin
>> twap	String	Risk indicator of forced repayment
Divided into multiple levels from 0 to 5, the larger the number, the more likely the forced repayment will be triggered.
Applicable to Spot mode/Multi-currency margin/Portfolio margin
>> frpType	String	Forced repayment (FRP) type
0: no FRP
1: user based FRP
2: platform based FRP

Return 1/2 when twap is >= 1, applicable to Spot mode/Multi-currency margin/Portfolio margin
>> maxLoan	String	Maximum borrowable amount for the currency under the current account conditions. Affects the amount available for margin borrowing and transfers.
Applicable to cross of Spot mode/Multi-currency margin/Portfolio margin
>> eqUsd	String	Equity USD of currency
>> borrowFroz	String	Potential borrowing IMR of currency in USD
Only applicable to Spot mode/Multi-currency margin/Portfolio margin. It is "" for other margin modes.
>> notionalLever	String	Leverage of currency
Applicable to Futures mode
>> coinUsdPrice	String	Price index USD of currency
>> stgyEq	String	Total equity allocated to trading bots for the currency. Covers Spot Grid, Futures Grid, Signal Bot, Futures Martingale, Spot Martingale, Infinite Grid, and Recurring Buy strategies.
>> isoUpl	String	Isolated unrealized profit and loss of currency
Applicable to Futures mode/Multi-currency margin/Portfolio margin
>> spotInUseAmt	String	Actual spot hedging amount in use for the currency.
Applicable to Portfolio margin
>> clSpotInUseAmt	String	User-defined spot hedging amount for the currency.
Applicable to Portfolio margin
>> maxSpotInUseAmt	String	System-calculated maximum possible spot hedging amount for the currency.
Applicable to Portfolio margin
>> spotIsoBal	String	Balance acquired through spot copy trading (as a follower or lead trader), including amounts currently frozen by open orders. For example, if 1 BTC was purchased via copy trading and 0.4 BTC is frozen in an open sell order, spotIsoBal returns 1, not 0.6.
Applicable to copy trading. Applicable to Spot mode/Futures mode.
>> smtSyncEq	String	Smart sync equity
The default is "0", only applicable to copy trader.
>> spotCopyTradingEq	String	Spot smart sync equity.
The default is "0", only applicable to copy trader.
>> spotBal	String	Spot balance. The unit is currency, e.g. BTC. More details
>> openAvgPx	String	Spot average cost price. The unit is USD. More details
>> accAvgPx	String	Spot accumulated cost price. The unit is USD. More details
>> spotUpl	String	Spot unrealized profit and loss. The unit is USD. More details
>> spotUplRatio	String	Spot unrealized profit and loss ratio. More details
>> totalPnl	String	Spot accumulated profit and loss. The unit is USD. More details
>> totalPnlRatio	String	Spot accumulated profit and loss ratio. More details
>> colRes	String	Platform level collateral restriction status
0: The restriction is not enabled.
1: The restriction is not enabled. But the crypto is close to the platform's collateral limit.
2: The restriction is enabled. This crypto can't be used as margin for your new orders. This may result in failed orders. But it will still be included in the account's adjusted equity and doesn't impact margin ratio.
Refer to Introduction to the platform collateralized borrowing limit for more details.
>> colBorrAutoConversion	String	Risk indicator of auto conversion. Divided into multiple levels from 1-5, the larger the number, the more likely the repayment will be triggered. The default will be 0, indicating there is no risk currently. 5 means this user is undergoing auto conversion now, 4 means this user will undergo auto conversion soon whereas 1/2/3 indicates there is a risk for auto conversion.
Applicable to Spot mode/Futures mode/Multi-currency margin/Portfolio margin
When the total liability for each crypto set as collateral exceeds a certain percentage of the platform's total limit, the auto-conversion mechanism may be triggered. This may result in the automatic sale of excess collateral crypto if you've set this crypto as collateral and have large borrowings. To lower this risk, consider reducing your use of the crypto as collateral or reducing your liabilities.
Refer to Introduction to the platform collateralized borrowing limit for more details.
>> collateralRestrict	Boolean	Platform level collateralized borrow restriction
true
false(deprecated, use colRes instead)
>> collateralEnabled	Boolean	true: Collateral enabled
false: Collateral disabled
Applicable to Multi-currency margin
>> autoLendStatus	String	Auto lend status
unsupported: auto lend is not supported by this currency
off: auto lend is supported but turned off
pending: auto lend is turned on but pending matching
active: auto lend is turned on and matched
>> autoLendMtAmt	String	Auto lend currency matched amount
Return "0" when autoLendStatus is unsupported/off/pending. Return matched amount when autoLendStatus is active
 "" will be returned for inapplicable fields under the current account level.

- The account data is sent on event basis and regular basis.
- The event push is not pushed in real-time. It is aggregated and pushed at a fixed time interval, around 50ms. For example, if multiple events occur within a fixed time interval, the system will aggregate them into a single message and push it at the end of the fixed time interval. If the data volume is too large, it may be split into multiple messages.
- The regular push sends updates regardless of whether there are activities in the trading account or not.

- Only currencies with non-zero balance will be pushed. Definition of non-zero balance: any value of eq, availEq, availBal parameters is not 0. If the data is too large to be sent in a single push message, it will be split into multiple messages.
- For example, when subscribing to account channel without specifying ccy and there are 5 currencies are with non-zero balance, all 5 currencies data will be pushed in initial snapshot and in regular update. Subsequently when there is change in balance or equity of an token, only the incremental data of that currency will be pushed triggered by this change.
Positions channel
Retrieve position information. Initial snapshot will be pushed according to subscription granularity. Data will be pushed when triggered by events such as placing/canceling order, and will also be pushed in regular interval according to subscription granularity.

Concurrent connection to this channel will be restricted by the following rules: WebSocket connection count limit.

URL Path
/ws/v5/private (required login)

Request Example : single

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "positions",
      "instType": "FUTURES",
      "instFamily": "BTC-USD"
    }
  ]
}
Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "positions",
      "instType": "ANY",
      "extraParams": "
        {
          \"updateInterval\": \"0\"
        }
      "
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
positions
> instType	String	Yes	Instrument type
MARGIN
SWAP
FUTURES
OPTION
ANY
> instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
> instId	String	No	Instrument ID
If instId and instFamily are both passed, instId will be used
> extraParams	String	No	Additional configuration
>> updateInterval	int	No	0: only push due to positions events
2000, 3000, 4000: push by events and regularly according to the time interval setting (ms)

The data will be pushed both by events and around per 5 seconds regularly if this field is omitted or set to other values than the valid values above.

The following format should be strictly followed when using this field.
"extraParams": "
{
\"updateInterval\": \"0\"
}
"
Successful Response Example : single

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "positions",
    "instType": "FUTURES",
    "instFamily": "BTC-USD"
  },
  "connId": "a4d3ae55"
}
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "positions",
    "instType": "ANY"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"positions\", \"instType\" : \"FUTURES\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instType	String	Yes	Instrument type
MARGIN
FUTURES
SWAP
OPTION
ANY
> instFamily	String	No	Instrument family
> instId	String	No	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example: single

{
  "arg":{
      "channel":"positions",
      "uid": "77982378738415879",
      "instType":"FUTURES"
  },
  "eventType": "snapshot",
  "curPage": 1,
  "lastPage": true,
  "data":[
    {
      "adl":"1",
      "availPos":"1",
      "avgPx":"2566.31",
      "cTime":"1619507758793",
      "ccy":"ETH",
      "deltaBS":"",
      "deltaPA":"",
      "gammaBS":"",
      "gammaPA":"",
      "hedgedPos":"",
      "imr":"",
      "instId":"ETH-USD-210430",
      "instType":"FUTURES",
      "interest":"0",
      "idxPx":"2566.13",
      "last":"2566.22",
      "lever":"10",
      "liab":"",
      "liabCcy":"",
      "liqPx":"2352.8496681818233",
      "markPx":"2353.849",
      "margin":"0.0003896645377994",
      "mgnMode":"isolated",
      "mgnRatio":"11.731726509588816",
      "mmr":"0.0000311811092368",
      "notionalUsd":"2276.2546609009605",
      "optVal":"",
      "pTime":"1619507761462",
      "pendingCloseOrdLiabVal":"0.1",
      "pos":"1",
      "baseBorrowed": "",
      "baseInterest": "",
      "quoteBorrowed": "",
      "quoteInterest": "",
      "posCcy":"",
      "posId":"307173036051017730",
      "posSide":"long",
      "spotInUseAmt": "",
      "clSpotInUseAmt": "",
      "maxSpotInUseAmt": "",
      "bizRefId": "",
      "bizRefType": "",
      "spotInUseCcy": "",
      "thetaBS":"",
      "thetaPA":"",
      "tradeId":"109844",
      "uTime":"1619507761462",
      "upl":"-0.0000009932766034",
      "uplLastPx":"-0.0000009932766034",
      "uplRatio":"-0.0025490556801078",
      "uplRatioLastPx":"-0.0025490556801078",
      "vegaBS":"",
      "vegaPA":"",
      "realizedPnl":"0.001",
      "pnl":"0.0011",
      "fee":"-0.0001",
      "fundingFee":"0",
      "liqPenalty":"0",
      "nonSettleAvgPx":"", 
      "settledPnl":"",
      "closeOrderAlgo":[
          {
              "algoId":"123",
              "slTriggerPx":"123",
              "slTriggerPxType":"mark",
              "tpTriggerPx":"123",
              "tpTriggerPxType":"mark",
              "closeFraction":"0.6"
          },
          {
              "algoId":"123",
              "slTriggerPx":"123",
              "slTriggerPxType":"mark",
              "tpTriggerPx":"123",
              "tpTriggerPxType":"mark",
              "closeFraction":"0.4"
          }
      ]
    }
  ]
}
Push Data Example

{
  "arg":{
      "channel":"positions",
      "uid": "77982378738415879",
      "instType":"ANY"
  },
  "eventType": "snapshot",
  "curPage": 1,
  "lastPage": true,
  "data":[
    {
      "adl":"1",
      "availPos":"1",
      "avgPx":"2566.31",
      "cTime":"1619507758793",
      "ccy":"ETH",
      "deltaBS":"",
      "deltaPA":"",
      "gammaBS":"",
      "gammaPA":"",
      "hedgedPos":"",
      "imr":"",
      "instId":"ETH-USD-210430",
      "instType":"FUTURES",
      "interest":"0",
      "idxPx":"2566.13",
      "last":"2566.22",
      "usdPx":"",
      "bePx":"2353.949",
      "lever":"10",
      "liab":"",
      "liabCcy":"",
      "liqPx":"2352.8496681818233",
      "markPx":"2353.849",
      "margin":"0.0003896645377994",
      "mgnMode":"isolated",
      "mgnRatio":"11.731726509588816",
      "mmr":"0.0000311811092368",
      "notionalUsd":"2276.2546609009605",
      "optVal":"",
      "pTime":"1619507761462",
      "pendingCloseOrdLiabVal":"0.1",
      "pos":"1",
      "baseBorrowed": "",
      "baseInterest": "",
      "quoteBorrowed": "",
      "quoteInterest": "",
      "posCcy":"",
      "posId":"307173036051017730",
      "posSide":"long",
      "spotInUseAmt": "",
      "clSpotInUseAmt": "",
      "maxSpotInUseAmt": "",
      "spotInUseCcy": "",
      "bizRefId": "",
      "bizRefType": "",
      "thetaBS":"",
      "thetaPA":"",
      "tradeId":"109844",
      "uTime":"1619507761462",
      "upl":"-0.0000009932766034",
      "uplLastPx":"-0.0000009932766034",
      "uplRatio":"-0.0025490556801078",
      "uplRatioLastPx":"-0.0025490556801078",
      "vegaBS":"",
      "vegaPA":"",
      "realizedPnl":"0.001",
      "pnl":"0.0011",
      "fee":"-0.0001",
      "fundingFee":"0",
      "liqPenalty":"0",
      "nonSettleAvgPx":"", 
      "settledPnl":"",
      "closeOrderAlgo":[
          {
              "algoId":"123",
              "slTriggerPx":"123",
              "slTriggerPxType":"mark",
              "tpTriggerPx":"123",
              "tpTriggerPxType":"mark",
              "closeFraction":"0.6"
          },
          {
              "algoId":"123",
              "slTriggerPx":"123",
              "slTriggerPxType":"mark",
              "tpTriggerPx":"123",
              "tpTriggerPxType":"mark",
              "closeFraction":"0.4"
          }
      ]
    }, {
      "adl":"1",
      "availPos":"1",
      "avgPx":"2566.31",
      "cTime":"1619507758793",
      "ccy":"ETH",
      "deltaBS":"",
      "deltaPA":"",
      "gammaBS":"",
      "gammaPA":"",
      "hedgedPos":"",
      "imr":"",
      "instId":"ETH-USD-SWAP",
      "instType":"SWAP",
      "interest":"0",
      "idxPx":"2566.13",
      "last":"2566.22",
      "usdPx":"",
      "bePx":"2353.949",
      "lever":"10",
      "liab":"",
      "liabCcy":"",
      "liqPx":"2352.8496681818233",
      "markPx":"2353.849",
      "margin":"0.0003896645377994",
      "mgnMode":"isolated",
      "mgnRatio":"11.731726509588816",
      "mmr":"0.0000311811092368",
      "notionalUsd":"2276.2546609009605",
      "optVal":"",
      "pTime":"1619507761462",
      "pendingCloseOrdLiabVal":"0.1",
      "pos":"1",
      "baseBorrowed": "",
      "baseInterest": "",
      "quoteBorrowed": "",
      "quoteInterest": "",
      "posCcy":"",
      "posId":"307173036051017730",
      "posSide":"long",
      "spotInUseAmt": "",
      "clSpotInUseAmt": "",
      "maxSpotInUseAmt": "",
      "spotInUseCcy": "",
      "bizRefId": "",
      "bizRefType": "",
      "thetaBS":"",
      "thetaPA":"",
      "tradeId":"109844",
      "uTime":"1619507761462",
      "upl":"-0.0000009932766034",
      "uplLastPx":"-0.0000009932766034",
      "uplRatio":"-0.0025490556801078",
      "uplRatioLastPx":"-0.0025490556801078",
      "vegaBS":"",
      "vegaPA":"",
      "realizedPnl":"0.001",
      "pnl":"0.0011",
      "fee":"-0.0001",
      "fundingFee":"0",
      "liqPenalty":"0",
      "nonSettleAvgPx":"", 
      "settledPnl":"",
      "closeOrderAlgo":[
          {
              "algoId":"123",
              "slTriggerPx":"123",
              "slTriggerPxType":"mark",
              "tpTriggerPx":"123",
              "tpTriggerPxType":"mark",
              "closeFraction":"0.6"
          },
          {
              "algoId":"123",
              "slTriggerPx":"123",
              "slTriggerPxType":"mark",
              "tpTriggerPx":"123",
              "tpTriggerPxType":"mark",
              "closeFraction":"0.4"
          }
      ]
    }
  ]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> uid	String	User Identifier
> instType	String	Instrument type
> instFamily	String	Instrument family
> instId	String	Instrument ID
eventType	String	Event type:
snapshot: Initial and regular snapshot push
event_update: Event-driven update push
curPage	Integer	Current page number.
Only applicable for snapshot events. Not included in event_update events.
lastPage	Boolean	Whether this is the last page of pagination:
true
false
Only applicable for snapshot events. Not included in event_update events.
data	Array of objects	Subscribed data
> instType	String	Instrument type
> mgnMode	String	Margin mode, cross isolated
> posId	String	Position ID
> posSide	String	Position side
long
short
net (FUTURES/SWAP/OPTION: positive pos means long position and negative pos means short position. MARGIN: posCcy being base currency means long position, posCcy being quote currency means short position.)
> pos	String	Quantity of positions. In the isolated margin mode, when doing manual transfers, a position with pos of 0 will be generated after the deposit is transferred
> hedgedPos	String	Hedged position size
Only return for accounts in delta neutral strategy, stgyType:1. Return "" for accounts in general strategy.
> baseBal	String	Base currency balance, only applicable to MARGIN（Quick Margin Mode）(Deprecated)
> quoteBal	String	Quote currency balance, only applicable to MARGIN（Quick Margin Mode）(Deprecated)
> baseBorrowed	String	Base currency amount already borrowed, only applicable to MARGIN(Quick Margin Mode）(Deprecated)
> baseInterest	String	Base Interest, undeducted interest that has been incurred, only applicable to MARGIN(Quick Margin Mode）(Deprecated)
> quoteBorrowed	String	Quote currency amount already borrowed, only applicable to MARGIN(Quick Margin Mode）(Deprecated)
> quoteInterest	String	Quote Interest, undeducted interest that has been incurred, only applicable to MARGIN(Quick Margin Mode）(Deprecated)
> posCcy	String	Position currency, only applicable to MARGIN positions
> availPos	String	Position that can be closed
Only applicable to MARGIN and OPTION.
For Margin position, the rest of sz will be SPOT trading after the liability is repaid while closing the position. Please get the available reduce-only amount from "Get maximum available tradable amount" if you want to reduce the amount of SPOT trading as much as possible.
> avgPx	String	Average open price
> upl	String	Unrealized profit and loss calculated by mark price.
> uplRatio	String	Unrealized profit and loss ratio calculated by mark price.
> uplLastPx	String	Unrealized profit and loss calculated by last price. Main usage is showing, actual value is upl.
> uplRatioLastPx	String	Unrealized profit and loss ratio calculated by last price.
> instId	String	Instrument ID, e.g. BTC-USDT-SWAP
> lever	String	Leverage, not applicable to OPTION seller
> liqPx	String	Estimated liquidation price
Not applicable to OPTION
> markPx	String	Latest Mark price
> imr	String	Initial margin requirement, only applicable to cross
> margin	String	Margin, can be added or reduced. Only applicable to isolated Margin.
> mgnRatio	String	Maintenance margin ratio
> mmr	String	Maintenance margin requirement
> liab	String	Liabilities, only applicable to MARGIN.
> liabCcy	String	Liabilities currency, only applicable to MARGIN.
> interest	String	Interest accrued that has not been settled.
> tradeId	String	Last trade ID
> notionalUsd	String	Notional value of positions in USD
> optVal	String	Option Value, only applicable to OPTION.
> pendingCloseOrdLiabVal	String	The amount of close orders of isolated margin liability.
> adl	String	Automatic-Deleveraging, signal area
Divided into 6 levels, from 0 to 5, the smaller the number, the weaker the adl intensity.
Only applicable to FUTURES/SWAP/OPTION
> bizRefId	String	External business id, e.g. experience coupon id
> bizRefType	String	External business type
> ccy	String	Currency used for margin
> last	String	Latest traded price
> idxPx	String	Latest underlying index price
> usdPx	String	Latest USD price of the ccy on the market, only applicable to FUTURES/SWAP/OPTION
> bePx	String	Breakeven price
> deltaBS	String	delta: Black-Scholes Greeks in dollars, only applicable to OPTION
> deltaPA	String	delta: Greeks in coins, only applicable to OPTION
> gammaBS	String	gamma: Black-Scholes Greeks in dollars, only applicable to OPTION
> gammaPA	String	gamma: Greeks in coins, only applicable to OPTION
> thetaBS	String	theta: Black-Scholes Greeks in dollars, only applicable to OPTION
> thetaPA	String	theta: Greeks in coins, only applicable to OPTION
> vegaBS	String	vega: Black-Scholes Greeks in dollars, only applicable to OPTION
> vegaPA	String	vega: Greeks in coins, only applicable to OPTION
> spotInUseAmt	String	Spot in use amount
Applicable to Portfolio margin
> spotInUseCcy	String	Spot in use unit, e.g. BTC
Applicable to Portfolio margin
> clSpotInUseAmt	String	User-defined spot risk offset amount
Applicable to Portfolio margin
> maxSpotInUseAmt	String	Max possible spot risk offset amount
Applicable to Portfolio margin
> realizedPnl	String	Realized profit and loss
Only applicable to FUTURES/SWAP/OPTION
realizedPnl=pnl+fee+fundingFee+liqPenalty+settledPnl
> pnl	String	Accumulated pnl of closing order(s) (excluding the fee).
> fee	String	Accumulated fee
Negative number represents the user transaction fee charged by the platform.Positive number represents rebate.
> fundingFee	String	Accumulated funding fee
> liqPenalty	String	Accumulated liquidation penalty. It is negative when there is a value.
> closeOrderAlgo	Array of objects	Close position algo orders attached to the position. This array will have values only after you request "Place algo order" with closeFraction=1.
>> algoId	String	Algo ID
>> slTriggerPx	String	Stop-loss trigger price.
>> slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
>> tpTriggerPx	String	Take-profit trigger price.
>> tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
>> closeFraction	String	Fraction of position to be closed when the algo order is triggered.
> cTime	String	Creation time, Unix timestamp format in milliseconds, e.g. 1597026383085.
> uTime	String	Latest time position was adjusted, Unix timestamp format in milliseconds, e.g. 1597026383085.
> pTime	String	Push time of positions information, Unix timestamp format in milliseconds, e.g. 1597026383085.
> nonSettleAvgPx	String	Non-Settlement entry price
The non-settlement entry price only reflects the average price at which the position is opened or increased.
Applicable to FUTURES cross
> settledPnl	String	Accumulated settled P&L (calculated by settlement price)
Applicable to FUTURES cross

- The position data is sent on event basis and regular basis
- The event push is not pushed in real-time. It is aggregated and pushed at a fixed time interval, around 50ms. For example, if multiple events occur within a fixed time interval, the system will aggregate them into a single message and push it at the end of the fixed time interval. If the data volume is too large, it may be split into multiple messages.
- The regular push sends updates regardless of whether there are position activities or not.
- If an event push and a regular push happen at the same time, the system will send the event push first, followed by the regular push.
 As for portfolio margin account, the IMR and MMR of the position are calculated in risk unit granularity, thus their values of the same risk unit cross positions are the same.
 In the position-by-position trading setting, it is an autonomous transfer mode. After the margin is transferred, positions with a position of 0 will be pushed

- Only position with non-zero position quantity will be pushed. Definition of non-zero quantity: value of pos parameter is not 0. If the data is too large to be sent in a single push message, it will be split into multiple messages.
- For example, when subscribing to positions channel specifying an underlying and there are 20 positions are with non-zero quantity, all 20 positions data will be pushed in initial snapshot and in regular push. Subsequently when there is change in pos of a position, only the data of that position will be pushed triggered by this change.
 Unlike futures contracts, option positions are automatically exercised or expire at maturity. The rights then terminate and no closing orders are generated. Therefore, this channel will not push any updates for expired option positions.
Balance and position channel
Retrieve account balance and position information. Data will be pushed when triggered by events such as filled order, funding transfer.
This channel applies to getting the account cash balance and the change of position asset ASAP.
Concurrent connection to this channel will be restricted by the following rules: WebSocket connection count limit.

URL Path
/ws/v5/private (required login)

Request Example

{
    "id": "1512",
    "op": "subscribe",
    "args": [{
        "channel": "balance_and_position"
    }]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
balance_and_position
Response Example

{
    "id": "1512",
    "event": "subscribe",
    "arg": {
        "channel": "balance_and_position"
    },
    "connId": "a4d3ae55"
}
Failure Response Example

{
    "id": "1512",
    "event": "error",
    "code": "60012",
    "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"balance_and_position\"}]}",
    "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Operation
subscribe
unsubscribe
error
arg	Object	No	List of subscribed channels
> channel	String	Yes	Channel name
balance_and_position
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
    "arg": {
        "channel": "balance_and_position",
        "uid": "77982378738415879"
    },
    "data": [{
        "pTime": "1597026383085",
        "eventType": "snapshot",
        "balData": [{
            "ccy": "BTC",
            "cashBal": "1",
            "uTime": "1597026383085"
        }],
        "posData": [{
            "posId": "1111111111",
            "tradeId": "2",
            "instId": "BTC-USD-191018",
            "instType": "FUTURES",
            "mgnMode": "cross",
            "posSide": "long",
            "pos": "10",
            "ccy": "BTC",
            "posCcy": "",
            "avgPx": "3320",
            "nonSettleAvgPx": "",
            "settledPnl": "",
            "uTime": "1597026383085"
        }],
        "trades": [{
            "instId": "BTC-USD-191018",
            "tradeId": "2",
        }]
    }]
}
Push data parameters
Parameter	Type	Description
arg	Object	Channel to subscribe to
> channel	String	Channel name
> uid	String	User Identifier
data	Array of objects	Subscribed data
> pTime	String	Push time of both balance and position information, millisecond format of Unix timestamp, e.g. 1597026383085
> eventType	String	Event Type
snapshot
delivered
exercised
transferred
filled
liquidation
claw_back
adl
funding_fee
adjust_margin
set_leverage
interest_deduction
settlement
> balData	Array of objects	Balance data
>> ccy	String	Currency
>> cashBal	String	Cash Balance
>> uTime	String	Update time, Unix timestamp format in milliseconds, e.g. 1597026383085
> posData	Array of objects	Position data
>> posId	String	Position ID
>> tradeId	String	Last trade ID
>> instId	String	Instrument ID, e.g BTC-USD-180213
>> instType	String	Instrument type
>> mgnMode	String	Margin mode
isolated, cross
>> avgPx	String	Average open price
>> ccy	String	Currency used for margin
>> posSide	String	Position side
long, short, net
>> pos	String	Quantity of positions. In the isolated margin mode, when doing manual transfers, a position with pos of 0 will be generated after the deposit is transferred
>> baseBal	String	Base currency balance, only applicable to MARGIN（Quick Margin Mode）(Deprecated)
>> quoteBal	String	Quote currency balance, only applicable to MARGIN（Quick Margin Mode）(Deprecated)
>> posCcy	String	Position currency, only applicable to MARGIN positions.
>> nonSettleAvgPx	String	Non-Settlement entry price
The non-settlement entry price only reflects the average price at which the position is opened or increased.
Applicable to FUTURES cross
>> settledPnl	String	Accumulated settled P&L (calculated by settlement price)
Applicable to FUTURES cross
>> uTime	String	Update time, Unix timestamp format in milliseconds, e.g. 1597026383085
> trades	Array of objects	Details of trade
>> instId	String	Instrument ID, e.g. BTC-USDT
>> tradeId	String	Trade ID
 Only balData will be pushed if only the account balance changes; only posData will be pushed if only the position changes.

- Initial snapshot: Only either position with non-zero position quantity or cash balance with non-zero quantity will be pushed. If the data is too large to be sent in a single push message, it will be split into multiple messages.
- For example, if you subscribe according to all currencies and the user has 5 currency balances that are not 0 and 20 positions, all 20 positions data and 5 currency balances data will be pushed in initial snapshot; Subsequently when there is change in pos of a position, only the data of that position will be pushed triggered by this change.
Position risk warning
This push channel is only used as a risk warning, and is not recommended as a risk judgment for strategic trading
In the case that the market is volatile, there may be the possibility that the position has been liquidated at the same time that this message is pushed.
The warning is sent when a position is at risk of liquidation for isolated margin positions. The warning is sent when all the positions are at risk of liquidation for cross-margin positions.
Concurrent connection to this channel will be restricted by the following rules: WebSocket connection count limit.

URL Path
/ws/v5/private (required login)

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "liquidation-warning",
      "instType": "ANY"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
liquidation-warning
> instType	String	Yes	Instrument type
MARGIN
SWAP
FUTURES
OPTION
ANY
> instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
> instId	String	No	Instrument ID
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "liquidation-warning",
    "instType": "ANY"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"liquidation-warning\", \"instType\" : \"FUTURES\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
liquidation-warning
> instType	String	Yes	Instrument type
OPTION
FUTURES
SWAP
MARGIN
ANY
> instFamily	String	No	Instrument family
> instId	String	No	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
    "arg":{
        "channel":"liquidation-warning",
        "uid": "77982378738415879",
        "instType":"FUTURES"
    },
    "data":[
        {
            "cTime":"1619507758793",
            "ccy":"ETH",
            "instId":"ETH-USD-210430",
            "instType":"FUTURES",
            "lever":"10",
            "markPx":"2353.849",
            "mgnMode":"isolated",
            "mgnRatio":"11.731726509588816",
            "pTime":"1619507761462",
            "pos":"1",
            "posCcy":"",
            "posId":"307173036051017730",
            "posSide":"long",
            "uTime":"1619507761462",
        }
    ]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> uid	String	User Identifier
> instType	String	Instrument type
> instFamily	String	Instrument family
> instId	String	Instrument ID
data	Array of objects	Subscribed data
> instType	String	Instrument type
> mgnMode	String	Margin mode, cross isolated
> posId	String	Position ID
> posSide	String	Position side
long
short
net (FUTURES/SWAP/OPTION: positive pos means long position and negative pos means short position. MARGIN: posCcy being base currency means long position, posCcy being quote currency means short position.)
> pos	String	Quantity of positions
> posCcy	String	Position currency, only applicable to MARGIN positions
> instId	String	Instrument ID, e.g. BTC-USDT-SWAP
> lever	String	Leverage, not applicable to OPTION seller
> markPx	String	Mark price
> mgnRatio	String	Maintenance margin ratio
> ccy	String	Currency used for margin
> cTime	String	Creation time, Unix timestamp format in milliseconds, e.g. 1597026383085.
> uTime	String	Latest time position was adjusted, Unix timestamp format in milliseconds, e.g. 1597026383085.
> pTime	String	Push time of positions information, Unix timestamp format in milliseconds, e.g. 1597026383085.
 Trigger push logic: the trigger logic of the liquidation warning and the liquidation message is the same
Order Book Trading
Trade
All Trade API endpoints require authentication.

POST / Place order
You can place an order only if you have sufficient funds.

Rate Limit: 60 requests per 2 seconds
Rate Limit of lead trader lead instruments for Copy Trading: 4 requests per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
Permission: Trade
Rate limit of this endpoint will also be affected by the rules Sub-account rate limit and Fill ratio based sub-account rate limit.

HTTP Request
POST /api/v5/trade/order

Request Example

 place order for SPOT
 POST /api/v5/trade/order
 body
 {
    "instId":"BTC-USDT",
    "tdMode":"cash",
    "clOrdId":"b15",
    "side":"buy",
    "ordType":"limit",
    "px":"2.15",
    "sz":"2"
}
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USDT
tdMode	String	Yes	Trade mode
Margin mode cross isolated
Non-Margin mode cash
spot_isolated (only applicable to SPOT lead trading, tdMode should be spot_isolated for SPOT lead trading.)
Note: isolated is not available in multi-currency margin mode and portfolio margin mode.
ccy	String	No	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode.
clOrdId	String	No	Client Order ID as assigned by the client
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
Only applicable to general order. It will not be posted to algoId when placing the attached algo order after the general order is filled completely.
tag	String	No	Order tag
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 16 characters.
side	String	Yes	Order side, buy sell
posSide	String	Conditional	Position side
The default is net in the net mode
It is required in the long/short mode, and can only be long or short.
Only applicable to FUTURES/SWAP.
ordType	String	Yes	Order type
market: Market order, only applicable to SPOT/MARGIN/FUTURES/SWAP
limit: Limit order
post_only: Post-only order
fok: Fill-or-kill order
ioc: Immediate-or-cancel order
optimal_limit_ioc: Market order with immediate-or-cancel order (applicable only to Expiry Futures and Perpetual Futures).
mmp: Market Maker Protection (only applicable to Option in Portfolio Margin mode)
mmp_and_post_only: Market Maker Protection and Post-only order(only applicable to Option in Portfolio Margin mode)
elp: Enhanced Liquidity Program order
sz	String	Yes	Quantity to buy or sell
px	String	Conditional	Order price. Only applicable to limit,post_only,fok,ioc,mmp,mmp_and_post_only order.
When placing an option order, one of px/pxUsd/pxVol must be filled in, and only one can be filled in
pxUsd	String	Conditional	Place options orders in USD
Only applicable to options
When placing an option order, one of px/pxUsd/pxVol must be filled in, and only one can be filled in
pxVol	String	Conditional	Place options orders based on implied volatility, where 1 represents 100%
Only applicable to options
When placing an option order, one of px/pxUsd/pxVol must be filled in, and only one can be filled in
reduceOnly	Boolean	No	Whether orders can only reduce in position size.
Valid options: true or false. The default value is false.
Only applicable to MARGIN orders, and FUTURES/SWAP orders in net mode
Only applicable to Futures mode and Multi-currency margin
tgtCcy	String	No	Whether the target currency uses the quote or base currency.
base_ccy: Base currency ,quote_ccy: Quote currency
Only applicable to SPOT Market Orders
Default is quote_ccy for buy, base_ccy for sell
banAmend	Boolean	No	Whether to disallow the system from amending the size of the SPOT Market Order.
Valid options: true or false. The default value is false.
If true, system will not amend and reject the market order if user does not have sufficient funds.
Only applicable to SPOT Market Orders
pxAmendType	String	No	The price amendment type for orders
0: Do not allow the system to amend to order price if px exceeds the price limit
1: Allow the system to amend the price to the best available value within the price limit if px exceeds the price limit
The default value is 0
tradeQuoteCcy	String	No	The quote currency used for trading. Only applicable to SPOT.
The default value is the quote currency of the instId, for example: for BTC-USD, the default is USD.
stpMode	String	No	Self trade prevention mode.
cancel_maker,cancel_taker, cancel_both
Cancel both does not support FOK

The account-level acctStpMode will be used to place orders by default. The default value of this field is cancel_maker. Users can log in to the webpage through the master account to modify this configuration. Users can also utilize the stpMode request parameter of the placing order endpoint to determine the stpMode of a certain order.
isElpTakerAccess	Boolean	No	ELP taker access
true: the request can trade with ELP orders but a speed bump will be applied
false: the request cannot trade with ELP orders and no speed bump

The default value is false while true is only applicable to ioc orders.
attachAlgoOrds	Array of objects	No	Attached TP/SL or trailing stop order information
> attachAlgoClOrdId	String	No	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
It will be posted to algoClOrdId when placing the attached algo order once the general order is filled completely.
> tpTriggerPx	String	Conditional	Take-profit trigger price
For condition TP order, if you fill in this parameter, you should fill in the take-profit order price as well.
> tpTriggerRatio	String	Conditional	Take profit trigger ratio, 0.3 represents 30%
Only one of tpTriggerPx and tpTriggerRatio can be passed
Only applicable to FUTURES and SWAP.
If the main order is a buy order, it must be greater than 0, and if the main order is a sell order, it must be between -1 and 0.
> tpOrdPx	String	Conditional	Take-profit order price

For condition TP order, if you fill in this parameter, you should fill in the take-profit trigger price as well.
For limit TP order, you need to fill in this parameter, but the take-profit trigger price doesn’t need to be filled.
If the price is -1, take-profit will be executed at the market price.
> tpOrdKind	String	No	TP order kind
condition
limit
The default is condition
> slTriggerPx	String	Conditional	Stop-loss trigger price
If you fill in this parameter, you should fill in the stop-loss order price.
> slTriggerRatio	String	Conditional	Stop-loss trigger ratio, 0.3 represents 30%
Only one of slTriggerPx and slTriggerRatio can be passed
Only applicable to FUTURES and SWAP.
If the main order is a buy order, it should be between 0 and 1, and if the main order is a sell order, it must be greater than 0.
> slOrdPx	String	Conditional	Stop-loss order price
If you fill in this parameter, you should fill in the stop-loss trigger price.
If the price is -1, stop-loss will be executed at the market price.
> tpTriggerPxType	String	No	Take-profit trigger price type
last: last price
index: index price
mark: mark price
The default is last
> slTriggerPxType	String	No	Stop-loss trigger price type
last: last price
index: index price
mark: mark price
The default is last
> sz	String	Conditional	Size. Only applicable to TP order of split TPs, and it is required for TP order of split TPs
> amendPxOnTriggerType	String	No	Whether to enable Cost-price SL. Only applicable to SL order of split TPs. Whether slTriggerPx will move to avgPx when the first TP order is triggered
0: disable, the default value
1: Enable
> callbackRatio	String	Conditional	Callback ratio, e.g. 0.05 represents 5%.
Either callbackRatio or callbackSpread is required. Only one can be passed.
Only applicable when ordType = move_order_stop
> callbackSpread	String	Conditional	Callback spread (price distance).
Either callbackRatio or callbackSpread is required. Only one can be passed.
Only applicable when ordType = move_order_stop
> activePx	String	No	Activation price.
The trailing stop is activated when the market price reaches the activation price. After activation, the system starts calculating the actual trigger price. If not provided, the trailing stop is activated immediately upon order placement.
Only applicable when ordType = move_order_stop
Response Example

{
  "code": "0",
  "msg": "",
  "data": [
    {
      "clOrdId": "oktswap6",
      "ordId": "312269865356374016",
      "tag": "",
      "ts":"1695190491421",
      "sCode": "0",
      "sMsg": "",
      "subCode": ""
    }
  ],
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Parameters
Parameter	Type	Description
code	String	The result code, 0 means success
msg	String	The error message, empty if the code is 0
data	Array of objects	Array of objects contains the response results
> ordId	String	Order ID
> clOrdId	String	Client Order ID as assigned by the client
> tag	String	Order tag
> ts	String	Timestamp when the order request processing is finished by our system, Unix timestamp format in milliseconds, e.g. 1597026383085
> sCode	String	The code of the event execution result, 0 means success.
> sMsg	String	Rejection or success message of event execution.
> subCode	String	Sub-code of sCode.
Returns "" when sCode is 0 (request successful).
When sCode is not 0 (request failed), returns the sub-code if available; otherwise returns "".
inTime	String	Timestamp at REST gateway when the request is received, Unix timestamp format in microseconds, e.g. 1597026383085123
The time is recorded after authentication.
outTime	String	Timestamp at REST gateway when the response is sent, Unix timestamp format in microseconds, e.g. 1597026383085123
 tdMode
Trade Mode, when placing an order, you need to specify the trade mode.
Spot mode:
- SPOT and OPTION buyer: cash
Futures mode:
- Isolated MARGIN: isolated
- Cross MARGIN: cross
- SPOT: cash
- Cross FUTURES/SWAP/OPTION: cross
- Isolated FUTURES/SWAP/OPTION: isolated
Multi-currency margin mode:
- Cross SPOT: cross
- Cross FUTURES/SWAP/OPTION: cross
Portfolio margin:
- Cross SPOT: cross
- Cross FUTURES/SWAP/OPTION: cross
 clOrdId
clOrdId is a user-defined unique order identifier at the User ID level. If provided in the request parameters, it will be included in the response and can be used as a request parameter to query, cancel, and amend orders.
clOrdId cannot duplicate any existing clOrdId of all current pending orders.
 posSide
Position side, this parameter is not mandatory in net mode. If you pass it through, the only valid value is net.
In long/short mode, it is mandatory. Valid values are long or short.
In long/short mode, side and posSide need to be specified in the combinations below:
Open long: buy and open long (side: fill in buy; posSide: fill in long)
Open short: sell and open short (side: fill in sell; posSide: fill in short)
Close long: sell and close long (side: fill in sell; posSide: fill in long)
Close short: buy and close short (side: fill in buy; posSide: fill in short)
Portfolio margin mode: Expiry Futures and Perpetual Futures only support net mode
 ordType
Order type. When creating a new order, you must specify the order type. The order type you specify will affect: 1) what order parameters are required, and 2) how the matching system executes your order. The following are valid order types:
limit: Limit order, which requires specified sz and px.
market: Market order. For SPOT and MARGIN, market order will be filled with market price (by swiping opposite order book). For Expiry Futures and Perpetual Futures, market order will be placed to order book with most aggressive price allowed by Price Limit Mechanism. For OPTION, market order is not supported yet. As the filled price for market orders cannot be determined in advance, OKX reserves/freezes your quote currency by an additional 5% for risk check.
post_only: Post-only order, which the order can only provide liquidity to the market and be a maker. If the order would have executed on placement, it will be canceled instead.
fok: Fill or kill order. If the order cannot be fully filled, the order will be canceled. The order would not be partially filled.
ioc: Immediate or cancel order. Immediately execute the transaction at the order price, cancel the remaining unfilled quantity of the order, and the order quantity will not be displayed in the order book.
optimal_limit_ioc: Market order with ioc (immediate or cancel). Immediately execute the transaction of this market order, cancel the remaining unfilled quantity of the order, and the order quantity will not be displayed in the order book. Only applicable to Expiry Futures and Perpetual Futures.
 sz
Quantity to buy or sell.
For SPOT/MARGIN Buy and Sell Limit Orders, it refers to the quantity in base currency.
For MARGIN Buy Market Orders, it refers to the quantity in quote currency.
For MARGIN Sell Market Orders, it refers to the quantity in base currency.
For SPOT Market Orders, it is set by tgtCcy.
For FUTURES/SWAP/OPTION orders, it refers to the number of contracts.
 reduceOnly
When placing an order with this parameter set to true, it means that the order will reduce the size of the position only
For the same MARGIN instrument, the coin quantity of all reverse direction pending orders adds `sz` of new `reduceOnly` order cannot exceed the position assets. After the debt is paid off, if there is a remaining size of orders, the position will not be opened in reverse, but will be traded in SPOT.
For the same FUTURES/SWAP instrument, the sum of the current order size and all reverse direction reduce-only pending orders which’s price-time priority is higher than the current order, cannot exceed the contract quantity of position.
Only applicable to `Futures mode` and `Multi-currency margin`
Only applicable to `MARGIN` orders, and `FUTURES`/`SWAP` orders in `net` mode
Notice: Under long/short mode of Expiry Futures and Perpetual Futures, all closing orders apply the reduce-only feature which is not affected by this parameter.
 tgtCcy
This parameter is used to specify the order quantity in the order request is denominated in the quantity of base or quote currency. This is applicable to SPOT Market Orders only.
Base currency: base_ccy
Quote currency: quote_ccy
If you use the Base Currency quantity for buy market orders or the Quote Currency for sell market orders, please note:
1. If the quantity you enter is greater than what you can buy or sell, the system will execute the order according to your maximum buyable or sellable quantity. If you want to trade according to the specified quantity, you should use Limit orders.
2. When the market price is too volatile, the locked balance may not be sufficient to buy the Base Currency quantity or sell to receive the Quote Currency that you specified. We will change the quantity of the order to execute the order based on best effort principle based on your account balance. In addition, we will try to over lock a fraction of your balance to avoid changing the order quantity.
2.1 Example of base currency buy market order:
Taking the market order to buy 10 LTCs as an example, and the user can buy 11 LTC. At this time, if 10 < 11, the order is accepted. When the LTC-USDT market price is 200, and the locked balance of the user is 3,000 USDT, as 200*10 < 3,000, the market order of 10 LTC is fully executed; If the market is too volatile and the LTC-USDT market price becomes 400, 400*10 > 3,000, the user's locked balance is not sufficient to buy using the specified amount of base currency, the user's maximum locked balance of 3,000 USDT will be used to settle the trade. Final transaction quantity becomes 3,000/400 = 7.5 LTC.
2.2 Example of quote currency sell market order:
Taking the market order to sell 1,000 USDT as an example, and the user can sell 1,200 USDT, 1,000 < 1,200, the order is accepted. When the LTC-USDT market price is 200, and the locked balance of the user is 6 LTC, as 1,000/200 < 6, the market order of 1,000 USDT is fully executed; If the market is too volatile and the LTC-USDT market price becomes 100, 100*6 < 1,000, the user's locked balance is not sufficient to sell using the specified amount of quote currency, the user's maximum locked balance of 6 LTC will be used to settle the trade. Final transaction quantity becomes 6 * 100 = 600 USDT.
 px
The value for px must be a multiple of tickSz for OPTION orders.
If not, the system will apply the rounding rules below. Using tickSz 0.0005 as an example:
The px will be rounded up to the nearest 0.0005 when the remainder of px to 0.0005 is more than 0.00025 or `px` is less than 0.0005.
The px will be rounded down to the nearest 0.0005 when the remainder of px to 0.0005 is less than 0.00025 and `px` is more than 0.0005.
 For placing order with TP/Sl:
1. TP/SL algo order will be generated only when this order is filled fully, or there is no TP/SL algo order generated.
2. Attaching TP/SL is neither supported for market buy with tgtCcy is base_ccy or market sell with tgtCcy is quote_ccy
3. If tpOrdKind is limit, and there is only one conditional TP order, attachAlgoClOrdId can be used as clOrdId for retrieving on "GET / Order details" endpoint.
4. For “split TPs”, including condition TP order and limit TP order.
* TP/SL orders in Split TPs only support one-way TP/SL. You can't use slTriggerPx&slOrdPx and tpTriggerPx&tpOrdPx at the same time, or error code 51076 will be thrown.
* Take-profit trigger price types (tpTriggerPxType) must be the same in an order with Split TPs attached, or error code 51080 will be thrown.
* Take-profit trigger prices (tpTriggerPx) cannot be the same in an order with Split TPs attached, or error code 51081 will be thrown.
* The size of the TP order among split TPs attached cannot be empty, or error code 51089 will be thrown.
* The total size of TP orders with Split TPs attached in a same order should equal the size of this order, or error code 51083 will be thrown.
* The number of TP orders with Split TPs attached in a same order cannot exceed 10, or error code 51079 will be thrown.
* Setting multiple TP and cost-price SL orders isn’t supported for spot and margin trading, or error code 51077 will be thrown.
* The number of SL orders with Split TPs attached in a same order cannot exceed 1, or error code 51084 will be thrown.
* The number of TP orders cannot be less than 2 when cost-price SL is enabled (amendPxOnTriggerType set as 1) for Split TPs, or error code 51085 will be thrown.
* All TP orders in one order must be of the same type, or error code 51091 will be thrown.
* TP order prices (tpOrdPx) in one order must be different, or error code 51092 will be thrown.
* TP limit order prices (tpOrdPx) in one order can't be –1 (market price), or error code 51093 will be thrown.
* You can't place TP limit orders in spot, margin, or options trading. Otherwise, error code 51094 will be thrown.
 Mandatory self trade prevention (STP)
The trading platform imposes mandatory self trade prevention at master account level, which means the accounts under the same master account, including master account itself and all its affiliated sub-accounts, will be prevented from self trade. The account-level acctStpMode will be used to place orders by default. The default value of this field is `cancel_maker`. Users can log in to the webpage through the master account to modify this configuration. Users can also utilize the stpMode request parameter of the placing order endpoint to determine the stpMode of a certain order.
Mandatory self trade prevention will not lead to latency.
There are three STP modes. The STP mode is always taken based on the configuration in the taker order.
1. Cancel Maker: This is the default STP mode, which cancels the maker order to prevent self-trading. Then, the taker order continues to match with the next order based on the order book priority.
2. Cancel Taker: The taker order is canceled to prevent self-trading. If the user's own maker order is lower in the order book priority, the taker order is partially filled and then canceled. FOK orders are always honored and canceled if they would result in self-trading.
3. Cancel Both: Both taker and maker orders are canceled to prevent self-trading. If the user's own maker order is lower in the order book priority, the taker order is partially filled. Then, the remaining quantity of the taker order and the first maker order are canceled. FOK orders are not supported in this mode.
 tradeQuoteCcy
For users in specific countries and regions, this parameter must be filled out for a successful order. Otherwise, the system will use the quote currency of instId as the default value, then error code 51000 will occur.
The value provided must be one of the enumerated values from tradeQuoteCcyList, which can be obtained from the endpoint Get instruments (GET /api/v5/account/instruments).
 Rate limit of orders tagged as isElpTakerAccess:true
- 50 orders per 2 seconds per User ID per instrument ID.
- This rate limit is shared in Place order/Place multiple orders endpoints in REST/WebSocket
POST / Place multiple orders
Place orders in batches. Maximum 20 orders can be placed per request.
Request parameters should be passed in the form of an array. Orders will be placed in turn

Rate Limit: 300 orders per 2 seconds
Rate Limit of lead trader lead instruments for Copy Trading: 4 orders per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
Permission: Trade
Rate limit of this endpoint will also be affected by the rules Sub-account rate limit and Fill ratio based sub-account rate limit.

 Unlike other endpoints, the rate limit of this endpoint is determined by the number of orders. If there is only one order in the request, it will consume the rate limit of `Place order`.
HTTP Request
POST /api/v5/trade/batch-orders

Request Example

 batch place order for SPOT
 POST /api/v5/trade/batch-orders
 body
 [
    {
        "instId":"BTC-USDT",
        "tdMode":"cash",
        "clOrdId":"b15",
        "side":"buy",
        "ordType":"limit",
        "px":"2.15",
        "sz":"2"
    },
    {
        "instId":"BTC-USDT",
        "tdMode":"cash",
        "clOrdId":"b16",
        "side":"buy",
        "ordType":"limit",
        "px":"2.15",
        "sz":"2"
    }
]

Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USDT
tdMode	String	Yes	Trade mode
Margin mode cross isolated
Non-Margin mode cash
spot_isolated (only applicable to SPOT lead trading, tdMode should be spot_isolated for SPOT lead trading.)
Note: isolated is not available in multi-currency margin mode and portfolio margin mode.
ccy	String	No	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode.
clOrdId	String	No	Client Order ID as assigned by the client
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
tag	String	No	Order tag
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 16 characters.
side	String	Yes	Order side buy sell
posSide	String	Conditional	Position side
The default is net in the net mode
It is required in the long/short mode, and can only be long or short.
Only applicable to FUTURES/SWAP.
ordType	String	Yes	Order type
market: Market order, only applicable to SPOT/MARGIN/FUTURES/SWAP
limit: Limit order
post_only: Post-only order
fok: Fill-or-kill order
ioc: Immediate-or-cancel order
optimal_limit_ioc: Market order with immediate-or-cancel order (applicable only to Expiry Futures and Perpetual Futures).
mmp: Market Maker Protection (only applicable to Option in Portfolio Margin mode)
mmp_and_post_only: Market Maker Protection and Post-only order(only applicable to Option in Portfolio Margin mode)
elp: Enhanced Liquidity Program order
sz	String	Yes	Quantity to buy or sell
px	String	Conditional	Order price. Only applicable to limit,post_only,fok,ioc,mmp,mmp_and_post_only order.
When placing an option order, one of px/pxUsd/pxVol must be filled in, and only one can be filled in
pxUsd	String	Conditional	Place options orders in USD
Only applicable to options
When placing an option order, one of px/pxUsd/pxVol must be filled in, and only one can be filled in
pxVol	String	Conditional	Place options orders based on implied volatility, where 1 represents 100%
Only applicable to options
When placing an option order, one of px/pxUsd/pxVol must be filled in, and only one can be filled in
reduceOnly	Boolean	No	Whether the order can only reduce position size.
Valid options: true or false. The default value is false.
Only applicable to MARGIN orders, and FUTURES/SWAP orders in net mode
Only applicable to Futures mode and Multi-currency margin
tgtCcy	String	No	Order quantity unit setting for sz
base_ccy: Base currency ,quote_ccy: Quote currency
Only applicable to SPOT Market Orders
Default is quote_ccy for buy, base_ccy for sell
banAmend	Boolean	No	Whether to disallow the system from amending the size of the SPOT Market Order.
Valid options: true or false. The default value is false.
If true, system will not amend and reject the market order if user does not have sufficient funds.
Only applicable to SPOT Market Orders
pxAmendType	String	No	The price amendment type for orders
0: Do not allow the system to amend to order price if px exceeds the price limit
1: Allow the system to amend the price to the best available value within the price limit if px exceeds the price limit
The default value is 0
tradeQuoteCcy	String	No	The quote currency used for trading. Only applicable to SPOT.
The default value is the quote currency of the instId, for example: for BTC-USD, the default is USD.
stpMode	String	No	Self trade prevention mode.
cancel_maker,cancel_taker, cancel_both
Cancel both does not support FOK.

The account-level acctStpMode will be used to place orders by default. The default value of this field is cancel_maker. Users can log in to the webpage through the master account to modify this configuration. Users can also utilize the stpMode request parameter of the placing order endpoint to determine the stpMode of a certain order.
isElpTakerAccess	Boolean	No	ELP taker access
true: the request can trade with ELP orders but a speed bump will be applied
false: the request cannot trade with ELP orders and no speed bump

The default value is false while true is only applicable to ioc orders.
attachAlgoOrds	Array of objects	No	Attached TP/SL or trailing stop order information
> attachAlgoClOrdId	String	No	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
It will be posted to algoClOrdId when placing the attached algo order once the general order is filled completely.
> tpTriggerPx	String	Conditional	Take-profit trigger price
For condition TP order, if you fill in this parameter, you should fill in the take-profit order price as well.
> tpTriggerRatio	String	Conditional	Take profit trigger ratio, 0.3 represents 30%
Only one of tpTriggerPx and tpTriggerRatio can be passed
Only applicable to FUTURES and SWAP.
If the main order is a buy order, it must be greater than 0, and if the main order is a sell order, it must be between -1 and 0.
> tpOrdPx	String	Conditional	Take-profit order price
For condition TP order, if you fill in this parameter, you should fill in the take-profit trigger price as well.
For limit TP order, you need to fill in this parameter, take-profit trigger needn't to be filled.
If the price is -1, take-profit will be executed at the market price.
> tpOrdKind	String	No	TP order kind
condition
limit
The default is condition
> slTriggerPx	String	Conditional	Stop-loss trigger price
If you fill in this parameter, you should fill in the stop-loss order price.
> slTriggerRatio	String	Conditional	Stop-loss trigger ratio, 0.3 represents 30%
Only one of slTriggerPx and slTriggerRatio can be passed
Only applicable to FUTURES and SWAP.
If the main order is a buy order, it should be between 0 and 1, and if the main order is a sell order, it must be greater than 0.
> slOrdPx	String	Conditional	Stop-loss order price
If you fill in this parameter, you should fill in the stop-loss trigger price.
If the price is -1, stop-loss will be executed at the market price.
> tpTriggerPxType	String	No	Take-profit trigger price type
last: last price
index: index price
mark: mark price
The default is last
> slTriggerPxType	String	No	Stop-loss trigger price type
last: last price
index: index price
mark: mark price
The default is last
> sz	String	Conditional	Size. Only applicable to TP order of split TPs, and it is required for TP order of split TPs
> amendPxOnTriggerType	String	No	Whether to enable Cost-price SL. Only applicable to SL order of split TPs. Whether slTriggerPx will move to avgPx when the first TP order is triggered
0: disable, the default value
1: Enable
> callbackRatio	String	Conditional	Callback ratio, e.g. 0.05 represents 5%.
Either callbackRatio or callbackSpread is required. Only one can be passed.
Only applicable when ordType = move_order_stop
> callbackSpread	String	Conditional	Callback spread (price distance).
Either callbackRatio or callbackSpread is required. Only one can be passed.
Only applicable when ordType = move_order_stop
> activePx	String	No	Activation price.
The trailing stop is activated when the market price reaches the activation price. After activation, the system starts calculating the actual trigger price. If not provided, the trailing stop is activated immediately upon order placement.
Only applicable when ordType = move_order_stop
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
        {
            "clOrdId":"oktswap6",
            "ordId":"12345689",
            "tag":"",
            "ts":"1695190491421",
            "sCode":"0",
            "sMsg":"",
            "subCode": ""
        },
        {
            "clOrdId":"oktswap7",
            "ordId":"12344",
            "tag":"",
            "ts":"1695190491421",
            "sCode":"0",
            "sMsg":"",
            "subCode": ""
        }
    ],
    "inTime": "1695190491421339",
    "outTime": "1695190491423240"
}
Response Parameters
Parameter	Type	Description
code	String	The result code, 0 means success
msg	String	The error message, empty if the code is 0
data	Array of objects	Array of objects contains the response results
> ordId	String	Order ID
> clOrdId	String	Client Order ID as assigned by the client
> tag	String	Order tag
> ts	String	Timestamp when the order request processing is finished by our system, Unix timestamp format in milliseconds, e.g. 1597026383085
> sCode	String	The code of the event execution result, 0 means success.
> sMsg	String	Rejection or success message of event execution.
> subCode	String	Sub-code of sCode.
Returns "" when sCode is 0 (request successful).
When sCode is not 0 (request failed), returns the sub-code if available; otherwise returns "".
inTime	String	Timestamp at REST gateway when the request is received, Unix timestamp format in microseconds, e.g. 1597026383085123
The time is recorded after authentication.
outTime	String	Timestamp at REST gateway when the response is sent, Unix timestamp format in microseconds, e.g. 1597026383085123
 In the `Portfolio Margin` account mode, either all orders are accepted by the system successfully, or all orders are rejected by the system.
 clOrdId
clOrdId is a user-defined unique ID used to identify the order. It will be included in the response parameters if you have specified during order submission, and can be used as a request parameter to the endpoints to query, cancel and amend orders.
clOrdId must be unique among all pending orders and the current request.
 Rate limit of orders tagged as isElpTakerAccess:true
- 50 orders per 2 seconds per User ID per instrument ID.
- This rate limit is shared in Place order/Place multiple orders endpoints in REST/WebSocket
POST / Cancel order
Cancel an incomplete order.

Rate Limit: 60 requests per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
Permission: Trade
HTTP Request
POST /api/v5/trade/cancel-order

Request Example

POST /api/v5/trade/cancel-order
body
{
    "ordId":"590908157585625111",
    "instId":"BTC-USD-190927"
}

Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USDT
ordId	String	Conditional	Order ID
Either ordId or clOrdId is required. If both are passed, ordId will be used.
clOrdId	String	Conditional	Client Order ID as assigned by the client
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
        {
            "clOrdId":"oktswap6",
            "ordId":"12345689",
            "ts":"1695190491421",
            "sCode":"0",
            "sMsg":""
        }
    ],
    "inTime": "1695190491421339",
    "outTime": "1695190491423240"
}
Response Parameters
Parameter	Type	Description
code	String	The result code, 0 means success
msg	String	The error message, empty if the code is 0
data	Array of objects	Array of objects contains the response results
> ordId	String	Order ID
> clOrdId	String	Client Order ID as assigned by the client
> ts	String	Timestamp when the order request processing is finished by our system, Unix timestamp format in milliseconds, e.g. 1597026383085
> sCode	String	The code of the event execution result, 0 means success.
> sMsg	String	Rejection message if the request is unsuccessful.
inTime	String	Timestamp at REST gateway when the request is received, Unix timestamp format in microseconds, e.g. 1597026383085123
The time is recorded after authentication.
outTime	String	Timestamp at REST gateway when the response is sent, Unix timestamp format in microseconds, e.g. 1597026383085123
 Cancel order returns with sCode equal to 0. It is not strictly considered that the order has been canceled. It only means that your cancellation request has been accepted by the system server. The result of the cancellation is subject to the state pushed by the order channel or the get order state.
POST / Cancel multiple orders
Cancel incomplete orders in batches. Maximum 20 orders can be canceled per request. Request parameters should be passed in the form of an array.

Rate Limit: 300 orders per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
Permission: Trade
 Unlike other endpoints, the rate limit of this endpoint is determined by the number of orders. If there is only one order in the request, it will consume the rate limit of `Cancel order`.
HTTP Request
POST /api/v5/trade/cancel-batch-orders

Request Example

POST /api/v5/trade/cancel-batch-orders
body
[
    {
        "instId":"BTC-USDT",
        "ordId":"590908157585625111"
    },
    {
        "instId":"BTC-USDT",
        "ordId":"590908544950571222"
    }
]
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USDT
ordId	String	Conditional	Order ID
Either ordId or clOrdId is required. If both are passed, ordId will be used.
clOrdId	String	Conditional	Client Order ID as assigned by the client
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
        {
            "clOrdId":"oktswap6",
            "ordId":"12345689",
            "ts":"1695190491421",
            "sCode":"0",
            "sMsg":""
        },
        {
            "clOrdId":"oktswap7",
            "ordId":"12344",
            "ts":"1695190491421",
            "sCode":"0",
            "sMsg":""
        }
    ],
    "inTime": "1695190491421339",
    "outTime": "1695190491423240"
}
Response Parameters
Parameter	Type	Description
code	String	The result code, 0 means success
msg	String	The error message, empty if the code is 0
data	Array of objects	Array of objects contains the response results
> ordId	String	Order ID
> clOrdId	String	Client Order ID as assigned by the client
> ts	String	Timestamp when the order request processing is finished by our system, Unix timestamp format in milliseconds, e.g. 1597026383085
> sCode	String	The code of the event execution result, 0 means success.
> sMsg	String	Rejection message if the request is unsuccessful.
inTime	String	Timestamp at REST gateway when the request is received, Unix timestamp format in microseconds, e.g. 1597026383085123
The time is recorded after authentication.
outTime	String	Timestamp at REST gateway when the response is sent, Unix timestamp format in microseconds, e.g. 1597026383085123
POST / Amend order
Amend an incomplete order.

Rate Limit: 60 requests per 2 seconds
Rate Limit of lead trader lead instruments for Copy Trading: 4 requests per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
Permission: Trade
Rate limit of this endpoint will also be affected by the rules Sub-account rate limit and Fill ratio based sub-account rate limit.

HTTP Request
POST /api/v5/trade/amend-order

Request Example

POST /api/v5/trade/amend-order
body
{
    "ordId":"590909145319051111",
    "newSz":"2",
    "instId":"BTC-USDT"
}
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID
cxlOnFail	Boolean	No	Whether the order needs to be automatically canceled when the order amendment fails
Valid options: false or true, the default is false.
ordId	String	Conditional	Order ID
Either ordId or clOrdId is required. If both are passed, ordId will be used.
clOrdId	String	Conditional	Client Order ID as assigned by the client
reqId	String	No	Client Request ID as assigned by the client for order amendment
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
The response will include the corresponding reqId to help you identify the request if you provide it in the request.
newSz	String	Conditional	New quantity after amendment and it has to be larger than 0. When amending a partially-filled order, the newSz should include the amount that has been filled.
newPx	String	Conditional	New price after amendment.
When modifying options orders, users can only fill in one of the following: newPx, newPxUsd, or newPxVol. It must be consistent with parameters when placing orders. For example, if users placed the order using px, they should use newPx when modifying the order.
newPxUsd	String	Conditional	Modify options orders using USD prices
Only applicable to options.
When modifying options orders, users can only fill in one of the following: newPx, newPxUsd, or newPxVol.
newPxVol	String	Conditional	Modify options orders based on implied volatility, where 1 represents 100%
Only applicable to options.
When modifying options orders, users can only fill in one of the following: newPx, newPxUsd, or newPxVol.
pxAmendType	String	No	The price amendment type for orders
0: Do not allow the system to amend to order price if newPx exceeds the price limit
1: Allow the system to amend the price to the best available value within the price limit if newPx exceeds the price limit
The default value is 0
attachAlgoOrds	Array of objects	No	Attached TP/SL or trailing stop order information
> attachAlgoId	String	Conditional	The order ID of the attached TP/SL or trailing stop order. It is required to identify the attached order when amending. It will not be posted to algoId when placing the attached algo order after the general order is filled completely.
> attachAlgoClOrdId	String	Conditional	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
It will be posted to algoClOrdId when placing the attached algo order once the general order is filled completely.
> newTpTriggerPx	String	Conditional	Take-profit trigger price.
Either the take profit trigger price or order price is 0, it means that the take profit is deleted.
> newTpTriggerRatio	String	Conditional	Take profit trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
Only one of newTpTriggerPx and newTpTriggerRatio can be passed.
If the main order is a buy order, it must be greater than 0, and if the main order is a sell order, it must be between -1 and 0. 0 means to delete the take-profit.
> newTpOrdPx	String	Conditional	Take-profit order price
If the price is -1, take-profit will be executed at the market price.
> newTpOrdKind	String	No	TP order kind
condition
limit
> newSlTriggerPx	String	Conditional	Stop-loss trigger price
Either the stop loss trigger price or order price is 0, it means that the stop loss is deleted.
> newSlTriggerRatio	String	Conditional	Stop-loss trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
Only one of newSlTriggerPx and newSlTriggerRatio can be passed.
If the main order is a buy order, it should be between 0 and 1, and if the main order is a sell order, it must be greater than 0.
Only one of newSlTriggerPx and newSlTriggerRatio can be passed, 0 means to delete the stop-loss.
> newSlOrdPx	String	Conditional	Stop-loss order price
If the price is -1, stop-loss will be executed at the market price.
> newTpTriggerPxType	String	Conditional	Take-profit trigger price type
last: last price
index: index price
mark: mark price
Only applicable to FUTURES/SWAP
If you want to add the take-profit, this parameter is required
> newSlTriggerPxType	String	Conditional	Stop-loss trigger price type
last: last price
index: index price
mark: mark price
Only applicable to FUTURES/SWAP
If you want to add the stop-loss, this parameter is required
> sz	String	Conditional	New size. Only applicable to TP order of split TPs, and it is required for TP order of split TPs
> amendPxOnTriggerType	String	No	Whether to enable Cost-price SL. Only applicable to SL order of split TPs.
0: disable, the default value
1: Enable
> newCallbackRatio	String	Conditional	New callback ratio, e.g. 0.05 represents 5%.
Either newCallbackRatio or newCallbackSpread can be passed. Only one can be passed.
Only applicable when ordType = move_order_stop
> newCallbackSpread	String	Conditional	New callback spread (price distance).
Either newCallbackRatio or newCallbackSpread can be passed. Only one can be passed.
Only applicable when ordType = move_order_stop
> newActivePx	String	No	New activation price.
Only applicable when ordType = move_order_stop
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
        {
         "clOrdId":"",
         "ordId":"12344",
         "ts":"1695190491421",
         "reqId":"b12344",
         "sCode":"0",
         "sMsg":""
         "subCode": ""
        }
    ],
    "inTime": "1695190491421339",
    "outTime": "1695190491423240"
}
Response Parameters
Parameter	Type	Description
code	String	The result code, 0 means success
msg	String	The error message, empty if the code is 0
data	Array of objects	Array of objects contains the response results
> ordId	String	Order ID
> clOrdId	String	Client Order ID as assigned by the client
> ts	String	Timestamp when the order request processing is finished by our system, Unix timestamp format in milliseconds, e.g. 1597026383085
> reqId	String	Client Request ID as assigned by the client for order amendment.
> sCode	String	The code of the event execution result, 0 means success.
> sMsg	String	Rejection message if the request is unsuccessful.
> subCode	String	Sub-code of sCode.
Returns "" when sCode is 0 (request successful).
When sCode is not 0 (request failed), returns the sub-code if available; otherwise returns "".
inTime	String	Timestamp at REST gateway when the request is received, Unix timestamp format in microseconds, e.g. 1597026383085123
The time is recorded after authentication.
outTime	String	Timestamp at REST gateway when the response is sent, Unix timestamp format in microseconds, e.g. 1597026383085123
 newSz
If the new quantity of the order is less than or equal to the filled quantity when you are amending a partially-filled order, the order status will be changed to filled.
 The amend order returns sCode equal to 0. It is not strictly considered that the order has been amended. It only means that your amend order request has been accepted by the system server. The result of the amend is subject to the status pushed by the order channel or the order status query
POST / Amend multiple orders
Amend incomplete orders in batches. Maximum 20 orders can be amended per request. Request parameters should be passed in the form of an array.

Rate Limit: 300 orders per 2 seconds
Rate Limit of lead trader lead instruments for Copy Trading: 4 orders per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
Permission: Trade
Rate limit of this endpoint will also be affected by the rules Sub-account rate limit and Fill ratio based sub-account rate limit.

 Unlike other endpoints, the rate limit of this endpoint is determined by the number of orders. If there is only one order in the request, it will consume the rate limit of `Amend order`.
HTTP Request
POST /api/v5/trade/amend-batch-orders

Request Example

POST /api/v5/trade/amend-batch-orders
body
[
    {
        "ordId":"590909308792049444",
        "newSz":"2",
        "instId":"BTC-USDT"
    },
    {
        "ordId":"590909308792049555",
        "newSz":"2",
        "instId":"BTC-USDT"
    }
]
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID
cxlOnFail	Boolean	No	Whether the order needs to be automatically canceled when the order amendment fails
false true, the default is false.
ordId	String	Conditional	Order ID
Either ordId or clOrdIdis required, if both are passed, ordId will be used.
clOrdId	String	Conditional	Client Order ID as assigned by the client
reqId	String	No	Client Request ID as assigned by the client for order amendment
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
The response will include the corresponding reqId to help you identify the request if you provide it in the request.
newSz	String	Conditional	New quantity after amendment and it has to be larger than 0. When amending a partially-filled order, the newSz should include the amount that has been filled.
newPx	String	Conditional	New price after amendment.
When modifying options orders, users can only fill in one of the following: newPx, newPxUsd, or newPxVol. It must be consistent with parameters when placing orders. For example, if users placed the order using px, they should use newPx when modifying the order.
newPxUsd	String	Conditional	Modify options orders using USD prices
Only applicable to options.
When modifying options orders, users can only fill in one of the following: newPx, newPxUsd, or newPxVol.
newPxVol	String	Conditional	Modify options orders based on implied volatility, where 1 represents 100%
Only applicable to options.
When modifying options orders, users can only fill in one of the following: newPx, newPxUsd, or newPxVol.
pxAmendType	String	No	The price amendment type for orders
0: Do not allow the system to amend to order price if newPx exceeds the price limit
1: Allow the system to amend the price to the best available value within the price limit if newPx exceeds the price limit
The default value is 0
attachAlgoOrds	Array of objects	No	Attached TP/SL or trailing stop order information
> attachAlgoId	String	Conditional	The order ID of the attached TP/SL or trailing stop order. It is required to identify the attached order when amending. It will not be posted to algoId when placing the attached algo order after the general order is filled completely.
> attachAlgoClOrdId	String	Conditional	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
It will be posted to algoClOrdId when placing the attached algo order once the general order is filled completely.
> newTpTriggerPx	String	Conditional	Take-profit trigger price.
Either the take profit trigger price or order price is 0, it means that the take profit is deleted.
> newTpTriggerRatio	String	Conditional	Take profit trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
Only one of newTpTriggerPx and newTpTriggerRatio can be passed
If the main order is a buy order, it must be greater than 0, and if the main order is a sell order, it must be between -1 and 0.
0 means to delete the take-profit.
> newTpOrdPx	String	Conditional	Take-profit order price
If the price is -1, take-profit will be executed at the market price.
> newTpOrdKind	String	No	TP order kind
condition
limit
> newSlTriggerPx	String	Conditional	Stop-loss trigger price
Either the stop loss trigger price or order price is 0, it means that the stop loss is deleted.
> newSlTriggerRatio	String	Conditional	Stop-loss trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
Only one of newSlTriggerPx and newSlTriggerRatio can be passed
If the main order is a buy order, it must be between 0 and 1, and if the main order is a sell order, it must be greater than 0.
0 means to delete the stop-loss.
> newSlOrdPx	String	Conditional	Stop-loss order price
If the price is -1, stop-loss will be executed at the market price.
> newTpTriggerPxType	String	Conditional	Take-profit trigger price type
last: last price
index: index price
mark: mark price
Only applicable to FUTURES/SWAP
If you want to add the take-profit, this parameter is required
> newSlTriggerPxType	String	Conditional	Stop-loss trigger price type
last: last price
index: index price
mark: mark price
Only applicable to FUTURES/SWAP
If you want to add the stop-loss, this parameter is required
> sz	String	Conditional	New size. Only applicable to TP order of split TPs, and it is required for TP order of split TPs
> amendPxOnTriggerType	String	No	Whether to enable Cost-price SL. Only applicable to SL order of split TPs.
0: disable, the default value
1: Enable
> newCallbackRatio	String	Conditional	New callback ratio, e.g. 0.05 represents 5%.
Either newCallbackRatio or newCallbackSpread can be passed. Only one can be passed.
Only applicable when ordType = move_order_stop
> newCallbackSpread	String	Conditional	New callback spread (price distance).
Either newCallbackRatio or newCallbackSpread can be passed. Only one can be passed.
Only applicable when ordType = move_order_stop
> newActivePx	String	No	New activation price.
Only applicable when ordType = move_order_stop
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
        {
            "clOrdId":"oktswap6",
            "ordId":"12345689",
            "ts":"1695190491421",
            "reqId":"b12344",
            "sCode":"0",
            "sMsg":"",
            "subCode": ""
        },
        {
            "clOrdId":"oktswap7",
            "ordId":"12344",
            "ts":"1695190491421",
            "reqId":"b12344",
            "sCode":"0",
            "sMsg":"",
            "subCode": ""
        }
    ],
    "inTime": "1695190491421339",
    "outTime": "1695190491423240"
}
Response Parameters
Parameter	Type	Description
code	String	The result code, 0 means success
msg	String	The error message, empty if the code is 0
data	Array of objects	Array of objects contains the response results
> ordId	String	Order ID
> clOrdId	String	Client Order ID as assigned by the client
> ts	String	Timestamp when the order request processing is finished by our system, Unix timestamp format in milliseconds, e.g. 1597026383085
> reqId	String	Client Request ID as assigned by the client for order amendment.
> sCode	String	The code of the event execution result, 0 means success.
> sMsg	String	Rejection message if the request is unsuccessful.
> subCode	String	Sub-code of sCode.
Returns "" when sCode is 0 (request successful).
When sCode is not 0 (request failed), returns the sub-code if available; otherwise returns "".
inTime	String	Timestamp at REST gateway when the request is received, Unix timestamp format in microseconds, e.g. 1597026383085123
The time is recorded after authentication.
outTime	String	Timestamp at REST gateway when the response is sent, Unix timestamp format in microseconds, e.g. 1597026383085123
 newSz
If the new quantity of the order is less than or equal to the filled quantity when you are amending a partially-filled order, the order status will be changed to filled.
POST / Close positions
Close the position of an instrument via a market order.

Rate Limit: 20 requests per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
Permission: Trade
HTTP Request
POST /api/v5/trade/close-position

Request Example

POST /api/v5/trade/close-position
body
{
    "instId":"BTC-USDT-SWAP",
    "mgnMode":"cross"
}
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID
posSide	String	Conditional	Position side
This parameter can be omitted in net mode, and the default value is net. You can only fill with net.
This parameter must be filled in under the long/short mode. Fill in long for close-long and short for close-short.
mgnMode	String	Yes	Margin mode
cross isolated
ccy	String	Conditional	Margin currency, required in the case of closing cross MARGIN position for Futures mode.
autoCxl	Boolean	No	Whether any pending orders for closing out needs to be automatically canceled when close position via a market order.
false or true, the default is false.
clOrdId	String	No	Client-supplied ID
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
tag	String	No	Order tag
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 16 characters.
Response Example

{
    "code": "0",
    "data": [
        {
            "clOrdId": "",
            "instId": "BTC-USDT-SWAP",
            "posSide": "long",
            "tag": ""
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
instId	String	Instrument ID
posSide	String	Position side
clOrdId	String	Client-supplied ID
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
tag	String	Order tag
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 16 characters.
 if there are any pending orders for closing out and the orders do not need to be automatically canceled, it will return an error code and message to prompt users to cancel pending orders before closing the positions.
GET / Order details
Retrieve order details.

Rate Limit: 60 requests per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
Permission: Read
HTTP Request
GET /api/v5/trade/order

Request Example

GET /api/v5/trade/order?ordId=1753197687182819328&instId=BTC-USDT

Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USDT
Only applicable to live instruments
ordId	String	Conditional	Order ID
Either ordId or clOrdId is required, if both are passed, ordId will be used
clOrdId	String	Conditional	Client Order ID as assigned by the client
If the clOrdId is associated with multiple orders, only the latest one will be returned.
Response Example

{
    "code": "0",
    "data": [
        {
            "accFillSz": "0.00192834",
            "algoClOrdId": "",
            "algoId": "",
            "attachAlgoClOrdId": "",
            "attachAlgoOrds": [],
            "avgPx": "51858",
            "cTime": "1708587373361",
            "cancelSource": "",
            "cancelSourceReason": "",
            "category": "normal",
            "ccy": "",
            "clOrdId": "",
            "fee": "-0.00000192834",
            "feeCcy": "BTC",
            "fillPx": "51858",
            "fillSz": "0.00192834",
            "fillTime": "1708587373361",
            "instId": "BTC-USDT",
            "instType": "SPOT",
            "isTpLimit": "false",
            "lever": "",
            "linkedAlgoOrd": {
                "algoId": ""
            },
            "ordId": "680800019749904384",
            "ordType": "market",
            "pnl": "0",
            "posSide": "net",
            "px": "",
            "pxType": "",
            "pxUsd": "",
            "pxVol": "",
            "quickMgnType": "",
            "rebate": "0",
            "rebateCcy": "USDT",
            "reduceOnly": "false",
            "side": "buy",
            "slOrdPx": "",
            "slTriggerPx": "",
            "slTriggerPxType": "",
            "source": "",
            "state": "filled",
            "stpId": "",
            "stpMode": "",
            "sz": "100",
            "tag": "",
            "tdMode": "cash",
            "tgtCcy": "quote_ccy",
            "tpOrdPx": "",
            "tpTriggerPx": "",
            "tpTriggerPxType": "",
            "tradeId": "744876980",
            "tradeQuoteCcy": "USDT",
            "uTime": "1708587373362"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
instId	String	Instrument ID
tgtCcy	String	Order quantity unit setting for sz
base_ccy: Base currency ,quote_ccy: Quote currency
Only applicable to SPOT Market Orders
Default is quote_ccy for buy, base_ccy for sell
ccy	String	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode, FUTURES and SWAP contracts.
ordId	String	Order ID
clOrdId	String	Client Order ID as assigned by the client
tag	String	Order tag
px	String	Price
For options, use coin as unit (e.g. BTC, ETH)
pxUsd	String	Options price in USDOnly applicable to options; return "" for other instrument types
pxVol	String	Implied volatility of the options orderOnly applicable to options; return "" for other instrument types
pxType	String	Price type of options
px: Place an order based on price, in the unit of coin (the unit for the request parameter px is BTC or ETH)
pxVol: Place an order based on pxVol
pxUsd: Place an order based on pxUsd, in the unit of USD (the unit for the request parameter px is USD)
sz	String	Quantity to buy or sell
pnl	String	Profit and loss (excluding the fee).
Applicable to orders which have a trade and aim to close position. It always is 0 in other conditions
ordType	String	Order type
market: Market order
limit: Limit order
post_only: Post-only order
fok: Fill-or-kill order
ioc: Immediate-or-cancel order
optimal_limit_ioc: Market order with immediate-or-cancel order
mmp: Market Maker Protection (only applicable to Option in Portfolio Margin mode)
mmp_and_post_only: Market Maker Protection and Post-only order(only applicable to Option in Portfolio Margin mode)
op_fok: Simple options (fok)
elp: Enhanced Liquidity Program order
side	String	Order side
posSide	String	Position side
tdMode	String	Trade mode
accFillSz	String	Accumulated fill quantity
The unit is base_ccy for SPOT and MARGIN, e.g. BTC-USDT, the unit is BTC; For market orders, the unit both is base_ccy when the tgtCcy is base_ccy or quote_ccy;
The unit is contract for FUTURES/SWAP/OPTION
fillPx	String	Last filled price. If none is filled, it will return "".
tradeId	String	Last traded ID
fillSz	String	Last filled quantity
The unit is base_ccy for SPOT and MARGIN, e.g. BTC-USDT, the unit is BTC; For market orders, the unit both is base_ccy when the tgtCcy is base_ccy or quote_ccy;
The unit is contract for FUTURES/SWAP/OPTION
fillTime	String	Last filled time
avgPx	String	Average filled price. If none is filled, it will return "".
state	String	State
canceled
live
partially_filled
filled
mmp_canceled
stpId	String	Self trade prevention ID
Return "" if self trade prevention is not applicable (Deprecated)
stpMode	String	Self trade prevention mode
lever	String	Leverage, from 0.01 to 125.
Only applicable to MARGIN/FUTURES/SWAP
attachAlgoClOrdId	String	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop.
tpTriggerPx	String	Take-profit trigger price.
tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
tpOrdPx	String	Take-profit order price.
slTriggerPx	String	Stop-loss trigger price.
slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
slOrdPx	String	Stop-loss order price.
attachAlgoOrds	Array of objects	Attached TP/SL or trailing stop order information
> attachAlgoId	String	The order ID of the attached TP/SL or trailing stop order. It can be used to identify the attached order when amending. It will not be posted to algoId when placing the attached algo order after the general order is filled completely.
> attachAlgoClOrdId	String	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
It will be posted to algoClOrdId when placing the attached algo order once the general order is filled completely.
> tpOrdKind	String	TP order kind
condition
limit
> tpTriggerPx	String	Take-profit trigger price.
> tpTriggerRatio	String	Take profit trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
> tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
> tpOrdPx	String	Take-profit order price.
> slTriggerPx	String	Stop-loss trigger price.
> slTriggerRatio	String	Stop-loss trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
> slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
> slOrdPx	String	Stop-loss order price.
> sz	String	Size. Only applicable to TP order of split TPs
> amendPxOnTriggerType	String	Whether to enable Cost-price SL. Only applicable to SL order of split TPs.
0: disable, the default value
1: Enable
> callbackRatio	String	Callback ratio, e.g. 0.05 represents 5%
> callbackSpread	String	Callback spread (price distance)
> activePx	String	Activation price
> failCode	String	The error code when failing to place TP/SL order, e.g. 51020
The default is ""
> failReason	String	The error reason when failing to place TP/SL order.
The default is ""
linkedAlgoOrd	Object	Linked SL order detail, only applicable to the order that is placed by one-cancels-the-other (OCO) order that contains the TP limit order.
> algoId	String	Algo ID
feeCcy	String	Fee currency
For maker sell orders of Spot and Margin, this represents the quote currency. For all other cases, it represents the currency in which fees are charged.
fee	String	Fee amount
For Spot and Margin (excluding maker sell orders): accumulated fee charged by the platform, always negative
For maker sell orders in Spot and Margin, Expiry Futures, Perpetual Futures and Options: accumulated fee and rebate (always in quote currency for maker sell orders in Spot and Margin)
rebateCcy	String	Rebate currency
For maker sell orders of Spot and Margin, this represents the base currency. For all other cases, it represents the currency in which rebates are paid.
rebate	String	Rebate amount, only applicable to Spot and Margin
For maker sell orders: Accumulated fee and rebate amount in the unit of base currency.
For all other cases, it represents the maker rebate amount, always positive, return "" if no rebate.
source	String	Order source
6: The normal order triggered by the trigger order
7:The normal order triggered by the TP/SL order
13: The normal order triggered by the algo order
25:The normal order triggered by the trailing stop order
34: The normal order triggered by the chase order
category	String	Category
normal
twap
adl
full_liquidation
partial_liquidation
delivery
ddh: Delta dynamic hedge
auto_conversion
reduceOnly	String	Whether the order can only reduce the position size. Valid options: true or false.
isTpLimit	String	Whether it is TP limit order. true or false
cancelSource	String	Code of the cancellation source.
cancelSourceReason	String	Reason for the cancellation.
quickMgnType	String	Quick Margin type, Only applicable to Quick Margin Mode of isolated margin
manual, auto_borrow, auto_repay (Deprecated)
algoClOrdId	String	Client-supplied Algo ID. There will be a value when algo order attaching algoClOrdId is triggered, or it will be "".
algoId	String	Algo ID. There will be a value when algo order is triggered, or it will be "".
uTime	String	Update time, Unix timestamp format in milliseconds, e.g. 1597026383085
cTime	String	Creation time, Unix timestamp format in milliseconds, e.g. 1597026383085
tradeQuoteCcy	String	The quote currency used for trading.
GET / Order List
Retrieve all incomplete orders under the current account.

Rate Limit: 60 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/trade/orders-pending

Request Example

GET /api/v5/trade/orders-pending?ordType=post_only,fok,ioc&instType=SPOT

Request Parameters
Parameter	Type	Required	Description
instType	String	No	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
instId	String	No	Instrument ID, e.g. BTC-USD-200927
ordType	String	No	Order type
market: Market order
limit: Limit order
post_only: Post-only order
fok: Fill-or-kill order
ioc: Immediate-or-cancel order
optimal_limit_ioc: Market order with immediate-or-cancel order
mmp: Market Maker Protection (only applicable to Option in Portfolio Margin mode)
mmp_and_post_only: Market Maker Protection and Post-only order(only applicable to Option in Portfolio Margin mode)
op_fok: Simple options (fok)
elp: Enhanced Liquidity Program order
state	String	No	State
live
partially_filled
after	String	No	Pagination of data to return records earlier than the requested ordId
before	String	No	Pagination of data to return records newer than the requested ordId
limit	String	No	Number of results per request. The maximum is 100; The default is 100
Response Example

{
    "code": "0",
    "data": [
        {
            "accFillSz": "0",
            "algoClOrdId": "",
            "algoId": "",
            "attachAlgoClOrdId": "",
            "attachAlgoOrds": [],
            "avgPx": "",
            "cTime": "1724733617998",
            "cancelSource": "",
            "cancelSourceReason": "",
            "category": "normal",
            "ccy": "",
            "clOrdId": "",
            "fee": "0",
            "feeCcy": "BTC",
            "fillPx": "",
            "fillSz": "0",
            "fillTime": "",
            "instId": "BTC-USDT",
            "instType": "SPOT",
            "isTpLimit": "false",
            "lever": "",
            "linkedAlgoOrd": {
                "algoId": ""
            },
            "ordId": "1752588852617379840",
            "ordType": "post_only",
            "pnl": "0",
            "posSide": "net",
            "px": "13013.5",
            "pxType": "",
            "pxUsd": "",
            "pxVol": "",
            "quickMgnType": "",
            "rebate": "0",
            "rebateCcy": "USDT",
            "reduceOnly": "false",
            "side": "buy",
            "slOrdPx": "",
            "slTriggerPx": "",
            "slTriggerPxType": "",
            "source": "",
            "state": "live",
            "stpId": "",
            "stpMode": "cancel_maker",
            "sz": "0.001",
            "tag": "",
            "tdMode": "cash",
            "tgtCcy": "",
            "tpOrdPx": "",
            "tpTriggerPx": "",
            "tpTriggerPxType": "",
            "tradeId": "",
            "tradeQuoteCcy": "USDT",
            "uTime": "1724733617998"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID
tgtCcy	String	Order quantity unit setting for sz
base_ccy: Base currency ,quote_ccy: Quote currency
Only applicable to SPOT Market Orders
Default is quote_ccy for buy, base_ccy for sell
ccy	String	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode, FUTURES and SWAP contracts.
ordId	String	Order ID
clOrdId	String	Client Order ID as assigned by the client
tag	String	Order tag
px	String	Price
For options, use coin as unit (e.g. BTC, ETH)
pxUsd	String	Options price in USD
Only applicable to options; return "" for other instrument types
pxVol	String	Implied volatility of the options order
Only applicable to options; return "" for other instrument types
pxType	String	Price type of options
px: Place an order based on price, in the unit of coin (the unit for the request parameter px is BTC or ETH)
pxVol: Place an order based on pxVol
pxUsd: Place an order based on pxUsd, in the unit of USD (the unit for the request parameter px is USD)
sz	String	Quantity to buy or sell
pnl	String	Profit and loss (excluding the fee).
Applicable to orders which have a trade and aim to close position. It always is 0 in other conditions
ordType	String	Order type
market: Market order
limit: Limit order
post_only: Post-only order
fok: Fill-or-kill order
ioc: Immediate-or-cancel order
optimal_limit_ioc: Market order with immediate-or-cancel order
mmp: Market Maker Protection (only applicable to Option in Portfolio Margin mode)
mmp_and_post_only: Market Maker Protection and Post-only order(only applicable to Option in Portfolio Margin mode)
op_fok: Simple options (fok)
elp: Enhanced Liquidity Program order
side	String	Order side
posSide	String	Position side
tdMode	String	Trade mode
accFillSz	String	Accumulated fill quantity
fillPx	String	Last filled price
tradeId	String	Last trade ID
fillSz	String	Last filled quantity
fillTime	String	Last filled time
avgPx	String	Average filled price. If none is filled, it will return "".
state	String	State
live
partially_filled
lever	String	Leverage, from 0.01 to 125.
Only applicable to MARGIN/FUTURES/SWAP
attachAlgoClOrdId	String	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop.
tpTriggerPx	String	Take-profit trigger price.
tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
tpOrdPx	String	Take-profit order price.
slTriggerPx	String	Stop-loss trigger price.
slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
slOrdPx	String	Stop-loss order price.
attachAlgoOrds	Array of objects	Attached TP/SL or trailing stop order information
> attachAlgoId	String	The order ID of the attached TP/SL or trailing stop order. It can be used to identify the attached order when amending. It will not be posted to algoId when placing the attached algo order after the general order is filled completely.
> attachAlgoClOrdId	String	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
It will be posted to algoClOrdId when placing the attached algo order once the general order is filled completely.
> tpOrdKind	String	TP order kind
condition
limit
> tpTriggerPx	String	Take-profit trigger price.
> tpTriggerRatio	String	Take profit trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
> tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
> tpOrdPx	String	Take-profit order price.
> slTriggerPx	String	Stop-loss trigger price.
> slTriggerRatio	String	Stop-loss trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
> slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
> slOrdPx	String	Stop-loss order price.
> sz	String	Size. Only applicable to TP order of split TPs
> amendPxOnTriggerType	String	Whether to enable Cost-price SL. Only applicable to SL order of split TPs.
0: disable, the default value
1: Enable
> callbackRatio	String	Callback ratio, e.g. 0.05 represents 5%
> callbackSpread	String	Callback spread (price distance)
> activePx	String	Activation price
> failCode	String	The error code when failing to place TP/SL order, e.g. 51020
The default is ""
> failReason	String	The error reason when failing to place TP/SL order.
The default is ""
linkedAlgoOrd	Object	Linked SL order detail, only applicable to the order that is placed by one-cancels-the-other (OCO) order that contains the TP limit order.
> algoId	String	Algo ID
stpId	String	Self trade prevention ID
Return "" if self trade prevention is not applicable (Deprecated)
stpMode	String	Self trade prevention mode
feeCcy	String	Fee currency
For maker sell orders of Spot and Margin, this represents the quote currency. For all other cases, it represents the currency in which fees are charged.
fee	String	Fee amount
For Spot and Margin (excluding maker sell orders): accumulated fee charged by the platform, always negative
For maker sell orders in Spot and Margin, Expiry Futures, Perpetual Futures and Options: accumulated fee and rebate (always in quote currency for maker sell orders in Spot and Margin)
rebateCcy	String	Rebate currency
For maker sell orders of Spot and Margin, this represents the base currency. For all other cases, it represents the currency in which rebates are paid.
rebate	String	Rebate amount, only applicable to Spot and Margin
For maker sell orders: Accumulated fee and rebate amount in the unit of base currency.
For all other cases, it represents the maker rebate amount, always positive, return "" if no rebate.
source	String	Order source
6: The normal order triggered by the trigger order
7: The normal order triggered by the TP/SL order
13: The normal order triggered by the algo order
25: The normal order triggered by the trailing stop order
34: The normal order triggered by the chase order
category	String	Category
normal
reduceOnly	String	Whether the order can only reduce the position size. Valid options: true or false.
quickMgnType	String	Quick Margin type, Only applicable to Quick Margin Mode of isolated margin
manual, auto_borrow, auto_repay (Deprecated)
algoClOrdId	String	Client-supplied Algo ID. There will be a value when algo order attaching algoClOrdId is triggered, or it will be "".
algoId	String	Algo ID. There will be a value when algo order is triggered, or it will be "".
isTpLimit	String	Whether it is TP limit order. true or false
uTime	String	Update time, Unix timestamp format in milliseconds, e.g. 1597026383085
cTime	String	Creation time, Unix timestamp format in milliseconds, e.g. 1597026383085
cancelSource	String	Code of the cancellation source.
cancelSourceReason	String	Reason for the cancellation.
tradeQuoteCcy	String	The quote currency used for trading.
GET / Order history (last 7 days)
Get completed orders which are placed in the last 7 days, including those placed 7 days ago but completed in the last 7 days.

The incomplete orders that have been canceled are only reserved for 2 hours.

Rate Limit: 40 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/trade/orders-history

Request Example

GET /api/v5/trade/orders-history?ordType=post_only,fok,ioc&instType=SPOT

Request Parameters
Parameter	Type	Required	Description
instType	String	yes	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
instId	String	No	Instrument ID, e.g. BTC-USDT
ordType	String	No	Order type
market: market order
limit: limit order
post_only: Post-only order
fok: Fill-or-kill order
ioc: Immediate-or-cancel order
optimal_limit_ioc: Market order with immediate-or-cancel order
mmp: Market Maker Protection (only applicable to Option in Portfolio Margin mode)
mmp_and_post_only: Market Maker Protection and Post-only order(only applicable to Option in Portfolio Margin mode)
op_fok: Simple options (fok)
elp: Enhanced Liquidity Program order
state	String	No	State
canceled
filled
mmp_canceled: Order canceled automatically due to Market Maker Protection
category	String	No	Category
twap
adl
full_liquidation
partial_liquidation
delivery
ddh: Delta dynamic hedge
after	String	No	Pagination of data to return records earlier than the requested ordId
before	String	No	Pagination of data to return records newer than the requested ordId
begin	String	No	Filter with a begin timestamp cTime. Unix timestamp format in milliseconds, e.g. 1597026383085
end	String	No	Filter with an end timestamp cTime. Unix timestamp format in milliseconds, e.g. 1597026383085
limit	String	No	Number of results per request. The maximum is 100; The default is 100
Response Example

{
    "code": "0",
    "data": [
        {
            "accFillSz": "0.00192834",
            "algoClOrdId": "",
            "algoId": "",
            "attachAlgoClOrdId": "",
            "attachAlgoOrds": [],
            "avgPx": "51858",
            "cTime": "1708587373361",
            "cancelSource": "",
            "cancelSourceReason": "",
            "category": "normal",
            "ccy": "",
            "clOrdId": "",
            "fee": "-0.00000192834",
            "feeCcy": "BTC",
            "fillPx": "51858",
            "fillSz": "0.00192834",
            "fillTime": "1708587373361",
            "instId": "BTC-USDT",
            "instType": "SPOT",
            "lever": "",
            "linkedAlgoOrd": {
                "algoId": ""
            },
            "ordId": "680800019749904384",
            "ordType": "market",
            "pnl": "0",
            "posSide": "",
            "px": "",
            "pxType": "",
            "pxUsd": "",
            "pxVol": "",
            "quickMgnType": "",
            "rebate": "0",
            "rebateCcy": "USDT",
            "reduceOnly": "false",
            "side": "buy",
            "slOrdPx": "",
            "slTriggerPx": "",
            "slTriggerPxType": "",
            "source": "",
            "state": "filled",
            "stpId": "",
            "stpMode": "",
            "sz": "100",
            "tag": "",
            "tdMode": "cash",
            "tgtCcy": "quote_ccy",
            "tpOrdPx": "",
            "tpTriggerPx": "",
            "tpTriggerPxType": "",
            "tradeId": "744876980",
            "tradeQuoteCcy": "USDT",
            "uTime": "1708587373362",
            "isTpLimit": "false"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID
tgtCcy	String	Order quantity unit setting for sz
base_ccy: Base currency ,quote_ccy: Quote currency
Only applicable to SPOT Market Orders
Default is quote_ccy for buy, base_ccy for sell
ccy	String	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode, FUTURES and SWAP contracts.
ordId	String	Order ID
clOrdId	String	Client Order ID as assigned by the client
tag	String	Order tag
px	String	Price
For options, use coin as unit (e.g. BTC, ETH)
pxUsd	String	Options price in USD
Only applicable to options; return "" for other instrument types
pxVol	String	Implied volatility of the options order
Only applicable to options; return "" for other instrument types
pxType	String	Price type of options
px: Place an order based on price, in the unit of coin (the unit for the request parameter px is BTC or ETH)
pxVol: Place an order based on pxVol
pxUsd: Place an order based on pxUsd, in the unit of USD (the unit for the request parameter px is USD)
sz	String	Quantity to buy or sell
ordType	String	Order type
market: market order
limit: limit order
post_only: Post-only order
fok: Fill-or-kill order
ioc: Immediate-or-cancel order
optimal_limit_ioc: Market order with immediate-or-cancel order
mmp: Market Maker Protection (only applicable to Option in Portfolio Margin mode)
mmp_and_post_only: Market Maker Protection and Post-only order(only applicable to Option in Portfolio Margin mode)
op_fok: Simple options (fok)
elp: Enhanced Liquidity Program order
side	String	Order side
posSide	String	Position side
tdMode	String	Trade mode
accFillSz	String	Accumulated fill quantity
fillPx	String	Last filled price. If none is filled, it will return "".
tradeId	String	Last trade ID
fillSz	String	Last filled quantity
fillTime	String	Last filled time
avgPx	String	Average filled price. If none is filled, it will return "".
state	String	State
canceled
filled
mmp_canceled
lever	String	Leverage, from 0.01 to 125.
Only applicable to MARGIN/FUTURES/SWAP
attachAlgoClOrdId	String	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop.
tpTriggerPx	String	Take-profit trigger price.
tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
tpOrdPx	String	Take-profit order price.
slTriggerPx	String	Stop-loss trigger price.
slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
slOrdPx	String	Stop-loss order price.
attachAlgoOrds	Array of objects	Attached TP/SL or trailing stop order information
> attachAlgoId	String	The order ID of the attached TP/SL or trailing stop order. It can be used to identify the attached order when amending. It will not be posted to algoId when placing the attached algo order after the general order is filled completely.
> attachAlgoClOrdId	String	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
It will be posted to algoClOrdId when placing the attached algo order once the general order is filled completely.
> tpOrdKind	String	TP order kind
condition
limit
> tpTriggerPx	String	Take-profit trigger price.
> tpTriggerRatio	String	Take profit trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
> tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
> tpOrdPx	String	Take-profit order price.
> slTriggerPx	String	Stop-loss trigger price.
> slTriggerRatio	String	Stop-loss trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
> slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
> slOrdPx	String	Stop-loss order price.
> sz	String	Size. Only applicable to TP order of split TPs
> amendPxOnTriggerType	String	Whether to enable Cost-price SL. Only applicable to SL order of split TPs.
0: disable, the default value
1: Enable
> callbackRatio	String	Callback ratio, e.g. 0.05 represents 5%
> callbackSpread	String	Callback spread (price distance)
> activePx	String	Activation price
> failCode	String	The error code when failing to place TP/SL order, e.g. 51020
The default is ""
> failReason	String	The error reason when failing to place TP/SL order.
The default is ""
linkedAlgoOrd	Object	Linked SL order detail, only applicable to the order that is placed by one-cancels-the-other (OCO) order that contains the TP limit order.
> algoId	String	Algo ID
stpId	String	Self trade prevention ID
Return "" if self trade prevention is not applicable (Deprecated)
stpMode	String	Self trade prevention mode
feeCcy	String	Fee currency
For maker sell orders of Spot and Margin, this represents the quote currency. For all other cases, it represents the currency in which fees are charged.
fee	String	Fee amount
For Spot and Margin (excluding maker sell orders): accumulated fee charged by the platform, always negative
For maker sell orders in Spot and Margin, Expiry Futures, Perpetual Futures and Options: accumulated fee and rebate (always in quote currency for maker sell orders in Spot and Margin)
rebateCcy	String	Rebate currency
For maker sell orders of Spot and Margin, this represents the base currency. For all other cases, it represents the currency in which rebates are paid.
rebate	String	Rebate amount, only applicable to Spot and Margin
For maker sell orders: Accumulated fee and rebate amount in the unit of base currency.
For all other cases, it represents the maker rebate amount, always positive, return "" if no rebate.
source	String	Order source
6: The normal order triggered by the trigger order
7: The normal order triggered by the TP/SL order
13: The normal order triggered by the algo order
25: The normal order triggered by the trailing stop order
34: The normal order triggered by the chase order
pnl	String	Profit and loss (excluding the fee).
Applicable to orders which have a trade and aim to close position. It always is 0 in other conditions
category	String	Category
normal
twap
adl
full_liquidation
partial_liquidation
delivery
ddh: Delta dynamic hedge
auto_conversion
reduceOnly	String	Whether the order can only reduce the position size. Valid options: true or false.
cancelSource	String	Code of the cancellation source.
cancelSourceReason	String	Reason for the cancellation.
algoClOrdId	String	Client-supplied Algo ID. There will be a value when algo order attaching algoClOrdId is triggered, or it will be "".
algoId	String	Algo ID. There will be a value when algo order is triggered, or it will be "".
isTpLimit	String	Whether it is TP limit order. true or false
uTime	String	Update time, Unix timestamp format in milliseconds, e.g. 1597026383085
cTime	String	Creation time, Unix timestamp format in milliseconds, e.g. 1597026383085
quickMgnType	String	Quick Margin type, Only applicable to Quick Margin Mode of isolated margin
manual, auto_borrow, auto_repay (Deprecated)
tradeQuoteCcy	String	The quote currency used for trading.
GET / Order history (last 3 months)
Get completed orders which are placed in the last 3 months, including those placed 3 months ago but completed in the last 3 months.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/trade/orders-history-archive

Request Example

GET /api/v5/trade/orders-history-archive?ordType=post_only,fok,ioc&instType=SPOT

Request Parameters
Parameter	Type	Required	Description
instType	String	yes	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
instId	String	No	Instrument ID, e.g. BTC-USD-200927
ordType	String	No	Order type
market: Market order
limit: Limit order
post_only: Post-only order
fok: Fill-or-kill order
ioc: Immediate-or-cancel order
optimal_limit_ioc: Market order with immediate-or-cancel order
mmp: Market Maker Protection (only applicable to Option in Portfolio Margin mode)
mmp_and_post_only: Market Maker Protection and Post-only order(only applicable to Option in Portfolio Margin mode)
op_fok: Simple options (fok)
elp: Enhanced Liquidity Program order
state	String	No	State
canceled
filled
mmp_canceled: Order canceled automatically due to Market Maker Protection
category	String	No	Category
twap
adl
full_liquidation
partial_liquidation
delivery
ddh: Delta dynamic hedge
after	String	No	Pagination of data to return records earlier than the requested ordId
before	String	No	Pagination of data to return records newer than the requested ordId
begin	String	No	Filter with a begin timestamp cTime. Unix timestamp format in milliseconds, e.g. 1597026383085
end	String	No	Filter with an end timestamp cTime. Unix timestamp format in milliseconds, e.g. 1597026383085
limit	String	No	Number of results per request. The maximum is 100; The default is 100
Response Example

{
    "code": "0",
    "data": [
        {
            "accFillSz": "0.00192834",
            "algoClOrdId": "",
            "algoId": "",
            "attachAlgoClOrdId": "",
            "attachAlgoOrds": [],
            "avgPx": "51858",
            "cTime": "1708587373361",
            "cancelSource": "",
            "cancelSourceReason": "",
            "category": "normal",
            "ccy": "",
            "clOrdId": "",
            "fee": "-0.00000192834",
            "feeCcy": "BTC",
            "fillPx": "51858",
            "fillSz": "0.00192834",
            "fillTime": "1708587373361",
            "instId": "BTC-USDT",
            "instType": "SPOT",
            "lever": "",
            "ordId": "680800019749904384",
            "ordType": "market",
            "pnl": "0",
            "posSide": "",
            "px": "",
            "pxType": "",
            "pxUsd": "",
            "pxVol": "",
            "quickMgnType": "",
            "rebate": "0",
            "rebateCcy": "USDT",
            "reduceOnly": "false",
            "side": "buy",
            "slOrdPx": "",
            "slTriggerPx": "",
            "slTriggerPxType": "",
            "source": "",
            "state": "filled",
            "stpId": "",
            "stpMode": "",
            "sz": "100",
            "tag": "",
            "tdMode": "cash",
            "tgtCcy": "quote_ccy",
            "tpOrdPx": "",
            "tpTriggerPx": "",
            "tpTriggerPxType": "",
            "tradeId": "744876980",
            "tradeQuoteCcy": "USDT",
            "uTime": "1708587373362",
            "isTpLimit": "false",
            "linkedAlgoOrd": {
                "algoId": ""
            }
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID
tgtCcy	String	Order quantity unit setting for sz
base_ccy: Base currency ,quote_ccy: Quote currency
Only applicable to SPOT Market Orders
Default is quote_ccy for buy, base_ccy for sell
ccy	String	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode, FUTURES and SWAP contracts.
ordId	String	Order ID
clOrdId	String	Client Order ID as assigned by the client
tag	String	Order tag
px	String	Price
For options, use coin as unit (e.g. BTC, ETH)
pxUsd	String	Options price in USDOnly applicable to options; return "" for other instrument types
pxVol	String	Implied volatility of the options orderOnly applicable to options; return "" for other instrument types
pxType	String	Price type of options
px: Place an order based on price, in the unit of coin (the unit for the request parameter px is BTC or ETH)
pxVol: Place an order based on pxVol
pxUsd: Place an order based on pxUsd, in the unit of USD (the unit for the request parameter px is USD)
sz	String	Quantity to buy or sell
ordType	String	Order type
market: Market order
limit: Limit order
post_only: Post-only order
fok: Fill-or-kill order
ioc: Immediate-or-cancel order
optimal_limit_ioc: Market order with immediate-or-cancel order
mmp: Market Maker Protection (only applicable to Option in Portfolio Margin mode)
mmp_and_post_only: Market Maker Protection and Post-only order(only applicable to Option in Portfolio Margin mode)
op_fok: Simple options (fok)
elp: Enhanced Liquidity Program order
side	String	Order side
posSide	String	Position side
tdMode	String	Trade mode
accFillSz	String	Accumulated fill quantity
fillPx	String	Last filled price. If none is filled, it will return "".
tradeId	String	Last trade ID
fillSz	String	Last filled quantity
fillTime	String	Last filled time
avgPx	String	Average filled price. If none is filled, it will return "".
state	String	State
canceled
filled
mmp_canceled
lever	String	Leverage, from 0.01 to 125.
Only applicable to MARGIN/FUTURES/SWAP
attachAlgoClOrdId	String	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop.
tpTriggerPx	String	Take-profit trigger price.
tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
tpOrdPx	String	Take-profit order price.
slTriggerPx	String	Stop-loss trigger price.
slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
slOrdPx	String	Stop-loss order price.
attachAlgoOrds	Array of objects	Attached TP/SL or trailing stop order information
> attachAlgoId	String	The order ID of the attached TP/SL or trailing stop order. It can be used to identify the attached order when amending. It will not be posted to algoId when placing the attached algo order after the general order is filled completely.
> attachAlgoClOrdId	String	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
It will be posted to algoClOrdId when placing the attached algo order once the general order is filled completely.
> tpOrdKind	String	TP order kind
condition
limit
> tpTriggerPx	String	Take-profit trigger price.
> tpTriggerRatio	String	Take profit trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
> tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
> tpOrdPx	String	Take-profit order price.
> slTriggerPx	String	Stop-loss trigger price.
> slTriggerRatio	String	Stop-loss trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
> slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
> slOrdPx	String	Stop-loss order price.
> sz	String	Size. Only applicable to TP order of split TPs
> amendPxOnTriggerType	String	Whether to enable Cost-price SL. Only applicable to SL order of split TPs.
0: disable, the default value
1: Enable
> callbackRatio	String	Callback ratio, e.g. 0.05 represents 5%
> callbackSpread	String	Callback spread (price distance)
> activePx	String	Activation price
> failCode	String	The error code when failing to place TP/SL order, e.g. 51020
The default is ""
> failReason	String	The error reason when failing to place TP/SL order.
The default is ""
linkedAlgoOrd	Object	Linked SL order detail, only applicable to the order that is placed by one-cancels-the-other (OCO) order that contains the TP limit order.
> algoId	String	Algo ID
stpId	String	Self trade prevention ID
Return "" if self trade prevention is not applicable (Deprecated)
stpMode	String	Self trade prevention mode
feeCcy	String	Fee currency
For maker sell orders of Spot and Margin, this represents the quote currency. For all other cases, it represents the currency in which fees are charged.
fee	String	Fee amount
For Spot and Margin (excluding maker sell orders): accumulated fee charged by the platform, always negative
For maker sell orders in Spot and Margin, Expiry Futures, Perpetual Futures and Options: accumulated fee and rebate (always in quote currency for maker sell orders in Spot and Margin)
rebateCcy	String	Rebate currency
For maker sell orders of Spot and Margin, this represents the base currency. For all other cases, it represents the currency in which rebates are paid.
rebate	String	Rebate amount, only applicable to Spot and Margin
For maker sell orders: Accumulated fee and rebate amount in the unit of base currency.
For all other cases, it represents the maker rebate amount, always positive, return "" if no rebate.
source	String	Order source
6: The normal order triggered by the trigger order
7:The normal order triggered by the TP/SL order
13: The normal order triggered by the algo order
25:The normal order triggered by the trailing stop order
34: The normal order triggered by the chase order
pnl	String	Profit and loss (excluding the fee).
Applicable to orders which have a trade and aim to close position. It always is 0 in other conditions
category	String	Category
normal
twap
adl
full_liquidation
partial_liquidation
delivery
ddh: Delta dynamic hedge
auto_conversion
reduceOnly	String	Whether the order can only reduce the position size. Valid options: true or false.
cancelSource	String	Code of the cancellation source.
cancelSourceReason	String	Reason for the cancellation.
algoClOrdId	String	Client-supplied Algo ID. There will be a value when algo order attaching algoClOrdId is triggered, or it will be "".
algoId	String	Algo ID. There will be a value when algo order is triggered, or it will be "".
isTpLimit	String	Whether it is TP limit order. true or false
uTime	String	Update time, Unix timestamp format in milliseconds, e.g. 1597026383085
cTime	String	Creation time, Unix timestamp format in milliseconds, e.g. 1597026383085
quickMgnType	String	Quick Margin type, Only applicable to Quick Margin Mode of isolated margin
manual, auto_borrow, auto_repay (Deprecated)
tradeQuoteCcy	String	The quote currency used for trading.
 This interface does not contain the order data of the `Canceled orders without any fills` type, which can be obtained through the `Get Order History (last 7 days)` interface.
 As far as OPTION orders that are complete, pxVol and pxUsd will update in time for px order, pxVol will update in time for pxUsd order, pxUsd will update in time for pxVol order.
GET / Transaction details (last 3 days)
Retrieve recently-filled transaction details in the last 3 day.

Rate Limit: 60 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/trade/fills

Request Example

GET /api/v5/trade/fills

Request Parameters
Parameter	Type	Required	Description
instType	String	No	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
instId	String	No	Instrument ID, e.g. BTC-USDT
ordId	String	No	Order ID
subType	String	No	Transaction type
1: Buy
2: Sell
3: Open long
4: Open short
5: Close long
6: Close short
100: Partial liquidation close long
101: Partial liquidation close short
102: Partial liquidation buy
103: Partial liquidation sell
104: Liquidation long
105: Liquidation short
106: Liquidation buy
107: Liquidation sell
110: Liquidation transfer in
111: Liquidation transfer out
118: System token conversion transfer in
119: System token conversion transfer out
112: Delivery long
113: Delivery short
125: ADL close long
126: ADL close short
127: ADL buy
128: ADL sell
212: Auto borrow of quick margin
213: Auto repay of quick margin
204: block trade buy
205: block trade sell
206: block trade open long
207: block trade open short
208: block trade close long
209: block trade close short
236: Easy convert in
237: Easy convert out
270: Spread trading buy
271: Spread trading sell
272: Spread trading open long
273: Spread trading open short
274: Spread trading close long
275: Spread trading close short
324: Move position buy
325: Move position sell
326: Move position open long
327: Move position open short
328: Move position close long
329: Move position close short
376: Collateralized borrowing auto conversion buy
377: Collateralized borrowing auto conversion sell
after	String	No	Pagination of data to return records earlier than the requested billId
before	String	No	Pagination of data to return records newer than the requested billId
begin	String	No	Filter with a begin timestamp ts. Unix timestamp format in milliseconds, e.g. 1597026383085
end	String	No	Filter with an end timestamp ts. Unix timestamp format in milliseconds, e.g. 1597026383085
limit	String	No	Number of results per request. The maximum is 100; The default is 100
Response Example

{
    "code": "0",
    "data": [
        {
            "side": "buy",
            "fillSz": "0.00192834",
            "fillPx": "51858",
            "fillPxVol": "",
            "fillFwdPx": "",
            "fee": "-0.00000192834",
            "fillPnl": "0",
            "ordId": "680800019749904384",
            "feeRate": "-0.001",
            "instType": "SPOT",
            "fillPxUsd": "",
            "instId": "BTC-USDT",
            "clOrdId": "",
            "posSide": "net",
            "billId": "680800019754098688",
            "subType": "1",
            "fillMarkVol": "",
            "tag": "",
            "fillTime": "1708587373361",
            "execType": "T",
            "fillIdxPx": "",
            "tradeId": "744876980",
            "fillMarkPx": "",
            "feeCcy": "BTC",
            "ts": "1708587373362",
            "tradeQuoteCcy": "USDT"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID
tradeId	String	Last trade ID
ordId	String	Order ID
clOrdId	String	Client Order ID as assigned by the client
billId	String	Bill ID
subType	String	Transaction type
tag	String	Order tag
fillPx	String	Last filled price. It is the same as the px from "Get bills details".
fillSz	String	Last filled quantity
fillIdxPx	String	Index price at the moment of trade execution
For cross currency spot pairs, it returns baseCcy-USDT index price. For example, for LTC-ETH, this field returns the index price of LTC-USDT.
fillPnl	String	Last filled profit and loss, applicable to orders which have a trade and aim to close position. It always is 0 in other conditions
fillPxVol	String	Implied volatility when filled
Only applicable to options; return "" for other instrument types
fillPxUsd	String	Options price when filled, in the unit of USD
Only applicable to options; return "" for other instrument types
fillMarkVol	String	Mark volatility when filled
Only applicable to options; return "" for other instrument types
fillFwdPx	String	Forward price when filled
Only applicable to options; return "" for other instrument types
fillMarkPx	String	Mark price when filled
Applicable to FUTURES, SWAP, OPTION
side	String	Order side, buy sell
posSide	String	Position side
long short
it returns net innet mode.
execType	String	Liquidity taker or maker
T: taker
M: maker
Not applicable to system orders such as ADL and liquidation
feeCcy	String	Trading fee or rebate currency
fee	String	The amount of trading fee or rebate. The trading fee deduction is negative, such as '-0.01'; the rebate is positive, such as '0.01'.
ts	String	Data generation time, Unix timestamp format in milliseconds, e.g. 1597026383085.
fillTime	String	Trade time which is the same as fillTime for the order channel.
feeRate	String	Fee rate. This field is returned for SPOT and MARGIN only
tradeQuoteCcy	String	The quote currency for trading.
 tradeId
For partial_liquidation, full_liquidation, or adl, when it comes to fill information, this field will be assigned a negative value to distinguish it from other matching transaction scenarios, when it comes to order information, this field will be 0.
 ordId
Order ID, always "" for block trading.
 clOrdId
Client-supplied order ID, always "" for block trading.
GET / Transaction details (last 3 months)
This endpoint can retrieve data from the last 3 months.

Rate Limit: 10 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/trade/fills-history

Request Example

GET /api/v5/trade/fills-history?instType=SPOT

Request Parameters
Parameter	Type	Required	Description
instType	String	YES	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
instId	String	No	Instrument ID, e.g. BTC-USDT
ordId	String	No	Order ID
subType	String	No	Transaction type
1: Buy
2: Sell
3: Open long
4: Open short
5: Close long
6: Close short
100: Partial liquidation close long
101: Partial liquidation close short
102: Partial liquidation buy
103: Partial liquidation sell
104: Liquidation long
105: Liquidation short
106: Liquidation buy
107: Liquidation sell
110: Liquidation transfer in
111: Liquidation transfer out
118: System token conversion transfer in
119: System token conversion transfer out
112: Delivery long
113: Delivery short
125: ADL close long
126: ADL close short
127: ADL buy
128: ADL sell
212: Auto borrow of quick margin
213: Auto repay of quick margin
204: block trade buy
205: block trade sell
206: block trade open long
207: block trade open short
208: block trade close long
209: block trade close short
236: Easy convert in
237: Easy convert out
270: Spread trading buy
271: Spread trading sell
272: Spread trading open long
273: Spread trading open short
274: Spread trading close long
275: Spread trading close short
324: Move position buy
325: Move position sell
326: Move position open long
327: Move position open short
328: Move position close long
329: Move position close short
376: Collateralized borrowing auto conversion buy
377: Collateralized borrowing auto conversion sell
after	String	No	Pagination of data to return records earlier than the requested billId
before	String	No	Pagination of data to return records newer than the requested billId
begin	String	No	Filter with a begin timestamp ts. Unix timestamp format in milliseconds, e.g. 1597026383085
end	String	No	Filter with an end timestamp ts. Unix timestamp format in milliseconds, e.g. 1597026383085
limit	String	No	Number of results per request. The maximum is 100; The default is 100
Response Example

{
    "code": "0",
    "data": [
        {
            "side": "buy",
            "fillSz": "0.00192834",
            "fillPx": "51858",
            "fillPxVol": "",
            "fillFwdPx": "",
            "fee": "-0.00000192834",
            "fillPnl": "0",
            "ordId": "680800019749904384",
            "feeRate": "-0.001",
            "instType": "SPOT",
            "fillPxUsd": "",
            "instId": "BTC-USDT",
            "clOrdId": "",
            "posSide": "net",
            "billId": "680800019754098688",
            "subType": "1",
            "fillMarkVol": "",
            "tag": "",
            "fillTime": "1708587373361",
            "execType": "T",
            "fillIdxPx": "",
            "tradeId": "744876980",
            "fillMarkPx": "",
            "feeCcy": "BTC",
            "ts": "1708587373362",
            "tradeQuoteCcy": "USDT"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID
tradeId	String	Last trade ID
ordId	String	Order ID
clOrdId	String	Client Order ID as assigned by the client
billId	String	Bill ID
subType	String	Transaction type
tag	String	Order tag
fillPx	String	Last filled price
fillSz	String	Last filled quantity
fillIdxPx	String	Index price at the moment of trade execution
For cross currency spot pairs, it returns baseCcy-USDT index price. For example, for LTC-ETH, this field returns the index price of LTC-USDT.
fillPnl	String	Last filled profit and loss, applicable to orders which have a trade and aim to close position. It always is 0 in other conditions
fillPxVol	String	Implied volatility when filled
Only applicable to options; return "" for other instrument types
fillPxUsd	String	Options price when filled, in the unit of USD
Only applicable to options; return "" for other instrument types
fillMarkVol	String	Mark volatility when filled
Only applicable to options; return "" for other instrument types
fillFwdPx	String	Forward price when filled
Only applicable to options; return "" for other instrument types
fillMarkPx	String	Mark price when filled
Applicable to FUTURES, SWAP, OPTION
side	String	Order side
buy
sell
posSide	String	Position side
long
short
it returns net innet mode.
execType	String	Liquidity taker or maker
T: taker
M: maker
Not applicable to system orders such as ADL and liquidation
feeCcy	String	Trading fee or rebate currency
fee	String	The amount of trading fee or rebate. The trading fee deduction is negative, such as '-0.01'; the rebate is positive, such as '0.01'.
ts	String	Data generation time, Unix timestamp format in milliseconds, e.g. 1597026383085.
fillTime	String	Trade time which is the same as fillTime for the order channel.
feeRate	String	Fee rate. This field is returned for SPOT and MARGIN only
tradeQuoteCcy	String	The quote currency for trading.
 tradeId
When the order category to which the transaction details belong is partial_liquidation, full_liquidation, or adl, this field will be assigned a negative value to distinguish it from other matching transaction scenarios.
 ordId
Order ID, always "" for block trading.
 clOrdId
Client-supplied order ID, always "" for block trading.
 We advise you to use Get Transaction details (last 3 days)when you request data for recent 3 days.
GET / One-click repay currency list (New)
Get list of debt currency data and repay currencies. Only applicable to SPOT mode/Multi-currency margin mode/Portfolio margin mode.

Rate Limit: 1 request per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/trade/one-click-repay-currency-list-v2

Request Example

GET /api/v5/trade/one-click-repay-currency-list-v2
Response Example

{
    "code": "0",
    "data": [
        {
            "debtData": [
                {
                    "debtAmt": "100",
                    "debtCcy": "USDC"
                }
            ],
            "repayData": [
                {
                    "repayAmt": "1.000022977",
                    "repayCcy": "BTC"
                },
                {
                    "repayAmt": "4998.0002397",
                    "repayCcy": "USDT"
                },
                {
                    "repayAmt": "100",
                    "repayCcy": "OKB"
                },
                {
                    "repayAmt": "1",
                    "repayCcy": "ETH"
                },
                {
                    "repayAmt": "100",
                    "repayCcy": "USDC"
                }
            ]
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
debtData	Array of objects	Debt currency data list
> debtCcy	String	Debt currency
> debtAmt	String	Debt currency amount
Including principal and interest
repayData	Array of objects	Repay currency data list
> repayCcy	String	Repay currency
> repayAmt	String	Repay currency's available balance amount
POST / Trade one-click repay (New)
Trade one-click repay to repay debts. Only applicable to SPOT mode/Multi-currency margin mode/Portfolio margin mode.

Rate Limit: 1 request per 2 seconds
Rate limit rule: User ID
Permission: Trade
HTTP Request
POST /api/v5/trade/one-click-repay-v2

Request Example

POST /api/v5/trade/one-click-repay-v2
body
{
    "debtCcy": "USDC", 
    "repayCcyList": ["USDC","BTC"] 
}
Request Parameters
Parameter	Type	Required	Description
debtCcy	String	Yes	Debt currency
repayCcyList	Array of strings	Yes	Repay currency list, e.g. ["USDC","BTC"]
The priority of currency to repay is consistent with the order in the array. (The first item has the highest priority)
Response Example

{
    "code": "0",
    "data": [
        {
            "debtCcy": "USDC",
            "repayCcyList": [
                "USDC",
                "BTC"
            ],
            "ts": "1742192217514"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
debtCcy	String	Debt currency
repayCcyList	Array of strings	Repay currency list, e.g. ["USDC","BTC"]
ts	String	Request time, Unix timestamp format in milliseconds, e.g. 1597026383085
GET / One-click repay history (New)
Get the history and status of one-click repay trades in the past 7 days. Only applicable to SPOT mode.

Rate Limit: 1 request per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/trade/one-click-repay-history-v2

Request Example

GET /api/v5/trade/one-click-repay-history-v2
Request Parameters
Parameter	Type	Required	Description
after	String	No	Pagination of data to return records earlier than (included) the requested time ts , Unix timestamp format in milliseconds, e.g. 1597026383085
before	String	No	Pagination of data to return records newer than (included) the requested time ts, Unix timestamp format in milliseconds, e.g. 1597026383085
limit	String	No	Number of results per request. The maximum is 100. The default is 100.
Response Example

{
    "code": "0",
    "data": [
        {
            "debtCcy": "USDC",
            "fillDebtSz": "9.079631989",
            "ordIdInfo": [
                {
                    "cTime": "1742194485439",
                    "fillPx": "1",
                    "fillSz": "9.088651",
                    "instId": "USDC-USDT",
                    "ordId": "2338478342062235648",
                    "ordType": "ioc",
                    "px": "1.0049",
                    "side": "buy",
                    "state": "filled",
                    "sz": "9.0886514537313433"
                },
                {
                    "cTime": "1742194482326",
                    "fillPx": "83271.9",
                    "fillSz": "0.00010969",
                    "instId": "BTC-USDT",
                    "ordId": "2338478237607288832",
                    "ordType": "ioc",
                    "px": "82856.7",
                    "side": "sell",
                    "state": "filled",
                    "sz": "0.000109696512171"
                }
            ],
            "repayCcyList": [
                "USDC",
                "BTC"
            ],
            "status": "filled",
            "ts": "1742194481852"
        },
        {
            "debtCcy": "USDC",
            "fillDebtSz": "100",
            "ordIdInfo": [],
            "repayCcyList": [
                "USDC",
                "BTC"
            ],
            "status": "filled",
            "ts": "1742192217511"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
debtCcy	String	Debt currency
repayCcyList	Array of strings	Repay currency list, e.g. ["USDC","BTC"]
fillDebtSz	String	Amount of debt currency transacted
status	String	Current status of one-click repay
running: Running
filled: Filled
failed: Failed
ordIdInfo	Array of objects	Order info
> ordId	String	Order ID
> instId	String	Instrument ID, e.g. BTC-USDT
> ordType	String	Order type
ioc: Immediate-or-cancel order
> side	String	Side
buy
sell
> px	String	Price
> sz	String	Quantity to buy or sell
> fillPx	String	Last filled price.
If none is filled, it will return "".
> fillSz	String	Last filled quantity
> state	String	State
filled
canceled
> cTime	String	Creation time for order, Unix timestamp format in milliseconds, e.g. 1597026383085
ts	String	Request time, Unix timestamp format in milliseconds, e.g. 1597026383085
POST / Cancel All After
Cancel all pending orders after the countdown timeout. Applicable to all trading symbols through order book (except Spread trading)

Rate Limit: 1 request per second
Rate limit rule: User ID + tag
Permission: Trade
HTTP Request
POST /api/v5/trade/cancel-all-after

Request Example

POST /api/v5/trade/cancel-all-after
{
   "timeOut":"60"
}
Request Parameters
Parameter	Type	Required	Description
timeOut	String	Yes	The countdown for order cancellation, with second as the unit.
Range of value can be 0, [10, 120].
Setting timeOut to 0 disables Cancel All After.
tag	String	No	CAA order tag
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 16 characters.
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
        {
            "triggerTime":"1587971460",
            "tag":"",
            "ts":"1587971400"
        }
    ]
}
Response Parameters
Parameter	Type	Description
triggerTime	String	The time the cancellation is triggered.
triggerTime=0 means Cancel All After is disabled.
tag	String	CAA order tag
ts	String	The time the request is received.
 Users are recommended to send heartbeat to the exchange every second. When the cancel all after is triggered, the trading engine will cancel orders on behalf of the client one by one and this operation may take up to a few seconds. This feature is intended as a protection mechanism for clients only and clients should not use this feature as part of their trading strategies.

To use tag level CAA, first, users need to set tags for their orders using the `tag` request parameter in the placing orders endpoint. When calling the CAA endpoint, if the `tag` request parameter is not provided, the default will be to set CAA at the account level. In this case, all pending orders for all order book trading symbols under that sub-account will be cancelled when CAA triggers, consistent with the existing logic. If the `tag` request parameter is provided, CAA will be set at the order tag level. When triggered, only pending orders of order book trading symbols with the specified tag will be canceled, while orders with other tags or no tags will remain unaffected.

Users can run a maximum of 20 tag level CAAs simultaneously under the same sub-account. The system will only count live tag level CAAs. CAAs that have been triggered or revoked by the user will not be counted. The user will receive error code 51071 when exceeding the limit.
GET / Account rate limit
Get account rate limit related information.

Only new order requests and amendment order requests will be counted towards this limit. For batch order requests consisting of multiple orders, each order will be counted individually.

For details, please refer to Fill ratio based sub-account rate limit

Rate Limit: 1 request per second
Rate limit rule: User ID
HTTP Request
GET /api/v5/trade/account-rate-limit

Request Example

# Get the account rate limit
GET /api/v5/trade/account-rate-limit

Request Parameters
None

Response Example

{
   "code":"0",
   "data":[
      {
         "accRateLimit":"2000",
         "fillRatio":"0.1234",
         "mainFillRatio":"0.1234",
         "nextAccRateLimit":"2000",
         "ts":"123456789000"
      }
   ],
   "msg":""
}

Response Parameters
Parameter	Type	Description
fillRatio	String	Sub account fill ratio during the monitoring period.
Applicable to users with trading fee tier >= VIP 5; other users will receive "".
If there has been no trading activity on the account in the past 7 days, "" will be returned.
If there is no executed volume during the monitoring period, "0" will be returned.
If there is executed volume but no order operation count during the monitoring period, "9999" will be returned.
mainFillRatio	String	Master account aggregated fill ratio during the monitoring period.
Applicable to users with trading fee tier >= VIP 5; other users will receive "".
If there has been no trading activity on the account in the past 7 days, "" will be returned.
If there is no executed volume during the monitoring period, "0" will be returned.
accRateLimit	String	Current sub-account rate limit per 2 seconds
nextAccRateLimit	String	Expected sub-account rate limit (per 2 seconds) in the next monitoring period.
Applicable to users with trading fee tier >= VIP 5; other users will receive "".
ts	String	Data update timestamp
For users with trading fee tier >= VIP 5, the data will be generated daily at 08:00 am (UTC)
For users with trading fee tier < VIP 5, the current timestamp will be returned.
WS / Order channel
Retrieve order information. Data will not be pushed when first subscribed. Data will only be pushed when there are new orders or order updates.

Concurrent connection to this channel will be restricted by the following rules: WebSocket connection count limit.

URL Path
/ws/v5/private (required login)

Request Example : single

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "orders",
      "instType": "FUTURES",
      "instId": "BTC-USD-200329"
    }
  ]
}
Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "orders",
      "instType": "FUTURES",
      "instFamily": "BTC-USD"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
orders
> instType	String	Yes	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
ANY
> instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
> instId	String	No	Instrument ID
Successful Response Example : single

{
  "id": "1512",
    "event": "subscribe",
    "arg": {
        "channel": "orders",
        "instType": "FUTURES",
        "instId": "BTC-USD-200329"
    },
    "connId": "a4d3ae55"
}
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "orders",
    "instType": "FUTURES",
    "instFamily": "BTC-USD"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"orders\", \"instType\" : \"FUTURES\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instType	String	Yes	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
ANY
> instFamily	String	No	Instrument family
> instId	String	No	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
    "arg": {
        "channel": "orders",
        "instType": "SPOT",
        "instId": "BTC-USDT",
        "uid": "614488474791936"
    },
    "data": [
        {
            "accFillSz": "0.001",
            "algoClOrdId": "",
            "algoId": "",
            "amendResult": "",
            "amendSource": "",
            "avgPx": "31527.1",
            "cancelSource": "",
            "category": "normal",
            "ccy": "",
            "clOrdId": "",
            "code": "0",
            "cTime": "1654084334977",
            "execType": "M",
            "fee": "-0.02522168",
            "feeCcy": "USDT",
            "fillFee": "-0.02522168",
            "fillFeeCcy": "USDT",
            "fillNotionalUsd": "31.50818374",
            "fillPx": "31527.1",
            "fillSz": "0.001",
            "fillPnl": "0.01",
            "fillTime": "1654084353263",
            "fillPxVol": "",
            "fillPxUsd": "",
            "fillMarkVol": "",
            "fillFwdPx": "",
            "fillMarkPx": "",
            "fillIdxPx": "",
            "instId": "BTC-USDT",
            "instType": "SPOT",
            "lever": "0",
            "msg": "",
            "notionalUsd": "31.50818374",
            "ordId": "452197707845865472",
            "ordType": "limit",
            "pnl": "0",
            "posSide": "",
            "px": "31527.1",
            "pxUsd":"",
            "pxVol":"",
            "pxType":"",
            "quickMgnType": "",
            "rebate": "0",
            "rebateCcy": "BTC",
            "reduceOnly": "false",
            "reqId": "",
            "side": "sell",
            "attachAlgoClOrdId": "",
            "slOrdPx": "",
            "slTriggerPx": "",
            "slTriggerPxType": "last",
            "source": "",
            "state": "filled",
            "stpId": "",
            "stpMode": "",
            "sz": "0.001",
            "tag": "",
            "tdMode": "cash",
            "tgtCcy": "",
            "tpOrdPx": "",
            "tpTriggerPx": "",
            "tpTriggerPxType": "last",
            "attachAlgoOrds": [],
            "tradeId": "242589207",
            "tradeQuoteCcy": "USDT",
            "lastPx": "38892.2",
            "uTime": "1654084353264",
            "isTpLimit": "false",
            "linkedAlgoOrd": {
                "algoId": ""
            }
        }
    ]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> uid	String	User Identifier
> instType	String	Instrument type
> instFamily	String	Instrument family
> instId	String	Instrument ID
data	Array of objects	Subscribed data
> instType	String	Instrument type
> instId	String	Instrument ID
> tgtCcy	String	Order quantity unit setting for sz
base_ccy: Base currency ,quote_ccy: Quote currency
Only applicable to SPOT Market orders.
Default is quote_ccy for buy, base_ccy for sell
> ccy	String	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode, FUTURES and SWAP contracts.
> ordId	String	Order ID
> clOrdId	String	Client Order ID as assigned by the client
> tag	String	Order tag
> px	String	Price
For options, use coin as unit (e.g. BTC, ETH)
> pxUsd	String	Options price in USDOnly applicable to options; return "" for other instrument types
> pxVol	String	Implied volatility of the options orderOnly applicable to options; return "" for other instrument types
> pxType	String	Price type of options
px: Place an order based on price, in the unit of coin (the unit for the request parameter px is BTC or ETH)
pxVol: Place an order based on pxVol
pxUsd: Place an order based on pxUsd, in the unit of USD (the unit for the request parameter px is USD)
> sz	String	The original order quantity, SPOT/MARGIN, in the unit of currency; FUTURES/SWAP/OPTION, in the unit of contract
> notionalUsd	String	Estimated national value in USD of order
> ordType	String	Order type
market: market order
limit: limit order
post_only: Post-only order
fok: Fill-or-kill order
ioc: Immediate-or-cancel order
optimal_limit_ioc: Market order with immediate-or-cancel order (applicable only to Expiry Futures and Perpetual Futures)
mmp: Market Maker Protection (only applicable to Option in Portfolio Margin mode)
mmp_and_post_only: Market Maker Protection and Post-only order(only applicable to Option in Portfolio Margin mode).
op_fok: Simple options (fok)
elp: Enhanced Liquidity Program order
> side	String	Order side, buy sell
> posSide	String	Position side
net
long or short Only applicable to FUTURES/SWAP
> tdMode	String	Trade mode, cross: cross isolated: isolated cash: cash
> fillPx	String	Filled price for the current update.
> tradeId	String	Trade ID for the current update.
> fillSz	String	Filled quantity for the current udpate.
The unit is base_ccy for SPOT and MARGIN, e.g. BTC-USDT, the unit is BTC; For market orders, the unit both is base_ccy when the tgtCcy is base_ccy or quote_ccy;
The unit is contract for FUTURES/SWAP/OPTION
> fillPnl	String	Filled profit and loss for the current udpate, applicable to orders which have a trade and aim to close position. It always is 0 in other conditions
> fillTime	String	Filled time for the current udpate.
> fillFee	String	Filled fee amount or rebate amount for the current udpate. :
Negative number represents the user transaction fee charged by the platform;
Positive number represents rebate
> fillFeeCcy	String	Filled fee currency or rebate currency for the current udpate..
It is fee currency when fillFee is less than 0; It is rebate currency when fillFee>=0.
> fillPxVol	String	Implied volatility when filled
Only applicable to options; return "" for other instrument types
> fillPxUsd	String	Options price when filled, in the unit of USD
Only applicable to options; return "" for other instrument types
> fillMarkVol	String	Mark volatility when filled
Only applicable to options; return "" for other instrument types
> fillFwdPx	String	Forward price when filled
Only applicable to options; return "" for other instrument types
> fillMarkPx	String	Mark price when filled
Applicable to FUTURES, SWAP, OPTION
> fillIdxPx	String	Index price at the moment of trade execution
For cross currency spot pairs, it returns baseCcy-USDT index price. For example, for LTC-ETH, this field returns the index price of LTC-USDT.
> execType	String	Liquidity taker or maker for the current update, T: taker M: maker
> accFillSz	String	Accumulated fill quantity
The unit is base_ccy for SPOT and MARGIN, e.g. BTC-USDT, the unit is BTC; For market orders, the unit both is base_ccy when the tgtCcy is base_ccy or quote_ccy;
The unit is contract for FUTURES/SWAP/OPTION
> fillNotionalUsd	String	Filled notional value in USD of order
> avgPx	String	Average filled price. If none is filled, it will return 0.
> state	String	Order state
canceled
live
partially_filled
filled
mmp_canceled
> lever	String	Leverage, from 0.01 to 125.
Only applicable to MARGIN/FUTURES/SWAP
> attachAlgoClOrdId	String	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop.
> tpTriggerPx	String	Take-profit trigger price, it
> tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
> tpOrdPx	String	Take-profit order price, it
> slTriggerPx	String	Stop-loss trigger price, it
> slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
> slOrdPx	String	Stop-loss order price, it
> attachAlgoOrds	Array of objects	Attached TP/SL or trailing stop order information
>> attachAlgoId	String	The order ID of the attached TP/SL or trailing stop order. It can be used to identify the attached order when amending. It will not be posted to algoId when placing the attached algo order after the general order is filled completely.
>> attachAlgoClOrdId	String	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
It will be posted to algoClOrdId when placing the attached algo order once the general order is filled completely.
>> tpOrdKind	String	TP order kind
condition
limit
>> tpTriggerPx	String	Take-profit trigger price.
>> tpTriggerRatio	String	Take-profit trigger ratio, 0.3 represents 30%. Only applicable to FUTURES/SWAP contracts.
>> tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
>> tpOrdPx	String	Take-profit order price.
>> slTriggerPx	String	Stop-loss trigger price.
>> slTriggerRatio	String	Stop-loss trigger ratio, 0.3 represents 30%. Only applicable to FUTURES/SWAP contracts.
>> slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
>> slOrdPx	String	Stop-loss order price.
>> sz	String	Size. Only applicable to TP order of split TPs
>> amendPxOnTriggerType	String	Whether to enable Cost-price SL. Only applicable to SL order of split TPs.
0: disable, the default value
1: Enable
>> callbackRatio	String	Callback ratio, e.g. 0.05 represents 5%
>> callbackSpread	String	Callback spread (price distance)
>> activePx	String	Activation price
> linkedAlgoOrd	Object	Linked SL order detail, only applicable to TP limit order of one-cancels-the-other order(oco)
>> algoId	Object	Algo ID
> stpId	String	Self trade prevention ID
Return "" if self trade prevention is not applicable (Deprecated)
> stpMode	String	Self trade prevention mode
> feeCcy	String	Fee currency
For maker sell orders of Spot and Margin, this represents the quote currency. For all other cases, it represents the currency in which fees are charged.
> fee	String	Fee amount
For Spot and Margin (excluding maker sell orders): accumulated fee charged by the platform, always negative
For maker sell orders in Spot and Margin, Expiry Futures, Perpetual Futures and Options: accumulated fee and rebate (always in quote currency for maker sell orders in Spot and Margin)
> rebateCcy	String	Rebate currency
For maker sell orders of Spot and Margin, this represents the base currency. For all other cases, it represents the currency in which rebates are paid.
> rebate	String	Rebate amount, only applicable to Spot and Margin
For maker sell orders: Accumulated fee and rebate amount in the unit of base currency.
For all other cases, it represents the maker rebate amount, always positive, return "" if no rebate.
> pnl	String	Profit and loss (excluding the fee).
applicable to orders which have a trade and aim to close position. It always is 0 in other conditions.
For liquidation under cross margin mode, it will include liquidation penalties.
> source	String	Order source
6: The normal order triggered by the trigger order
7:The normal order triggered by the TP/SL order
13: The normal order triggered by the algo order
25:The normal order triggered by the trailing stop order
34: The normal order triggered by the chase order
> cancelSource	String	Source of the order cancellation.
Valid values and the corresponding meanings are:
0: Order canceled by system
1: Order canceled by user
2: Order canceled: Pre reduce-only order canceled, due to insufficient margin in user position
3: Order canceled: Risk cancellation was triggered. Pending order was canceled due to insufficient maintenance margin ratio and forced-liquidation risk.
4: Order canceled: Borrowings of crypto reached hard cap, order was canceled by system.
6: Order canceled: ADL order cancellation was triggered. Pending order was canceled due to a low margin ratio and forced-liquidation risk.
7: Order canceled: Futures contract delivery.
9: Order canceled: Insufficient balance after funding fees deducted.
10: Order canceled: Option contract expiration.
13: Order canceled: FOK order was canceled due to incompletely filled.
14: Order canceled: IOC order was partially canceled due to incompletely filled.
15: Order canceled: The order price is beyond the limit
17: Order canceled: Close order was canceled, due to the position was already closed at market price.
20: Cancel all after triggered
21: Order canceled: The TP/SL order was canceled because the position had been closed
22 Order canceled: Due to a better price was available for the order in the same direction, the current operation reduce-only order was automatically canceled
23 Order canceled: Due to a better price was available for the order in the same direction, the existing reduce-only order was automatically canceled
27: Order canceled: Price limit verification failed because the price difference between counterparties exceeds 5%
31: The post-only order will take liquidity in taker orders
32: Self trade prevention
33: The order exceeds the maximum number of order matches per taker order
36: Your TP limit order was canceled because the corresponding SL order was triggered.
37: Your TP limit order was canceled because the corresponding SL order was canceled.
38: You have canceled market maker protection (MMP) orders.
39: Your order was canceled because market maker protection (MMP) was triggered.
42: Your order was canceled because the difference between the initial and current best bid or ask prices reached the maximum chase difference.
43: Order cancelled because the buy order price is higher than the index price or the sell order price is lower than the index price.
44: Your order was canceled because your available balance of this crypto was insufficient for auto conversion. Auto conversion was triggered when the total collateralized liabilities for this crypto reached the platform’s risk control limit.
45: Order cancelled because ELP order price verification failed
46: delta reducing cancel orders
> amendSource	String	Source of the order amendation.
1: Order amended by user
2: Order amended by user, but the order quantity is overriden by system due to reduce-only
3: New order placed by user, but the order quantity is overriden by system due to reduce-only
4: Order amended by system due to other pending orders
5: Order modification due to changes in options px, pxVol, or pxUsd as a result of following variations. For example, when iv = 60, USD and px are anchored at iv = 60, the changes in USD or px lead to modification.
> category	String	Category
normal
twap
adl
full_liquidation
partial_liquidation
delivery
ddh: Delta dynamic hedge
auto_conversion
> isTpLimit	String	Whether it is TP limit order. true or false
> uTime	String	Update time, Unix timestamp format in milliseconds, e.g. 1597026383085
> cTime	String	Creation time, Unix timestamp format in milliseconds, e.g. 1597026383085
> reqId	String	Client Request ID as assigned by the client for order amendment. "" will be returned if there is no order amendment.
> amendResult	String	The result of amending the order
-1: failure
0: success
1: Automatic cancel (amendment request returned success but amendment subsequently failed then automatically canceled by the system)
2: Automatic amendation successfully, only applicable to pxVol and pxUsd orders of Option.
When amending the order through API and cxlOnFail is set to true in the order amendment request but the amendment is rejected, "" is returned.
When amending the order through API, the order amendment acknowledgement returns success and the amendment subsequently failed, -1 will be returned if cxlOnFail is set to false, 1 will be returned if cxlOnFail is set to true.
When amending the order through Web/APP and the amendment failed, -1 will be returned.
> reduceOnly	String	Whether the order can only reduce the position size. Valid options: true or false.
> quickMgnType	String	Quick Margin type, Only applicable to Quick Margin Mode of isolated margin
manual, auto_borrow, auto_repay (Deprecated)
> algoClOrdId	String	Client-supplied Algo ID. There will be a value when algo order attaching algoClOrdId is triggered, or it will be "".
> algoId	String	Algo ID. There will be a value when algo order is triggered, or it will be "".
> lastPx	String	Last price
> code	String	Error Code, the default is 0
> msg	String	Error Message, The default is ""
> tradeQuoteCcy	String	The quote currency used for trading.
 For market orders, it's likely the orders channel will show order state as "filled" while showing the "last filled quantity (fillSz)" as 0.
 In exceptional cases, the same message may be sent multiple times (perhaps with the different uTime) . The following guidelines are advised:

1. If a `tradeId` is present, it means a fill. Each `tradeId` should only be returned once per instrument ID, and the later messages that have the same `tradeId` should be discarded.
2. If `tradeId` is absent and the `state` is "filled," it means that the `SPOT`/`MARGIN` market order is fully filled. For messages with the same `ordId`, process only the first filled message and discard any subsequent messages. State = filled is the terminal state of an order.
3. If the state is `canceled` or `mmp_canceled`, it indicates that the order has been canceled. For cancellation messages with the same `ordId`, process the first one and discard later messages. State = canceled / mmp_canceled is the terminal state of an order.
4. If `reqId` is present, it indicates a response to a user-requested order modification. It is recommended to use a unique `reqId` for each modification request. For modification messages with the same `reqId`, process only the first message received and discard subsequent messages.
 The definitions for fillPx, tradeId, fillSz, fillPnl, fillTime, fillFee, fillFeeCcy, and execType differ between the REST order information endpoints and the orders channel.
 The definitions for fillPx, tradeId, fillSz, fillPnl, fillTime, fillFee, fillFeeCcy, and execType differ between the REST order information endpoints and the orders channel.
 Unlike futures contracts, option positions are automatically exercised or expire at maturity. The rights then terminate and no closing orders are generated. Therefore, this channel will not push any closing-order updates for expired options.
WS / Place order
You can place an order only if you have sufficient funds.


URL Path
/ws/v5/private (required login)

Rate Limit: 60 requests per 2 seconds
Rate Limit of lead trader lead instruments for Copy Trading: 4 requests per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
Rate limit of this endpoint will also be affected by the rules Sub-account rate limit and Fill ratio based sub-account rate limit.

 Rate limit is shared with the `Place order` REST API endpoints
Request Example

{
  "id": "1512",
  "op": "order",
  "args": [
    {
      "side": "buy",
      "instIdCode": 123456,
      "tdMode": "isolated",
      "ordType": "market",
      "sz": "100"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	Yes	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
order
args	Array of objects	Yes	Request parameters
> instIdCode	Integer	是	Instrument ID code.
> tdMode	String	Yes	Trade mode
Margin mode isolated cross
Non-Margin mode cash
spot_isolated (only applicable to SPOT lead trading, tdMode should be spot_isolated for SPOT lead trading.)
> ccy	String	No	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode.
> clOrdId	String	No	Client Order ID as assigned by the client
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
> tag	String	No	Order tag
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 16 characters.
> side	String	Yes	Order side, buy sell
> posSide	String	Conditional	Position side
The default is net in the net mode
It is required in the long/short mode, and can only be long or short.
Only applicable to FUTURES/SWAP.
> ordType	String	Yes	Order type
market: Market order, only applicable to SPOT/MARGIN/FUTURES/SWAP
limit: limit order
post_only: Post-only order
fok: Fill-or-kill order
ioc: Immediate-or-cancel order
optimal_limit_ioc: Market order with immediate-or-cancel order
mmp: Market Maker Protection (only applicable to Option in Portfolio Margin mode)
mmp_and_post_only: Market Maker Protection and Post-only order(only applicable to Option in Portfolio Margin mode)
elp: Enhanced Liquidity Program order
> sz	String	Yes	Quantity to buy or sell.
> px	String	Conditional	Order price. Only applicable to limit,post_only,fok,ioc,mmp,mmp_and_post_only order.
When placing an option order, one of px/pxUsd/pxVol must be filled in, and only one can be filled in
> pxUsd	String	Conditional	Place options orders in USD
Only applicable to options
When placing an option order, one of px/pxUsd/pxVol must be filled in, and only one can be filled in
> pxVol	String	Conditional	Place options orders based on implied volatility, where 1 represents 100%
Only applicable to options
When placing an option order, one of px/pxUsd/pxVol must be filled in, and only one can be filled in
> reduceOnly	Boolean	No	Whether the order can only reduce the position size.
Valid options: true or false. The default value is false.
Only applicable to MARGIN orders, and FUTURES/SWAP orders in net mode
Only applicable to Futures mode and Multi-currency margin
> tgtCcy	String	No	Order quantity unit setting for sz
base_ccy: Base currency ,quote_ccy: Quote currency
Only applicable to SPOT Market Orders
Default is quote_ccy for buy, base_ccy for sell
> banAmend	Boolean	No	Whether to disallow the system from amending the size of the SPOT Market Order.
Valid options: true or false. The default value is false.
If true, system will not amend and reject the market order if user does not have sufficient funds.
Only applicable to SPOT Market Orders
> pxAmendType	String	No	The price amendment type for orders
0: Do not allow the system to amend to order price if px exceeds the price limit
1: Allow the system to amend the price to the best available value within the price limit if px exceeds the price limit
The default value is 0
> tradeQuoteCcy	String	No	The quote currency used for trading. Only applicable to SPOT.
The default value is the quote currency of the instId, for example: for BTC-USD, the default is USD.
> stpMode	String	No	Self trade prevention mode.
cancel_maker,cancel_taker, cancel_both.
Cancel both does not support FOK

The account-level acctStpMode will be used to place orders. The default value of this field is cancel_maker. Users can log in to the webpage through the master account to modify this configuration. Users can also utilize the stpMode request parameter of the placing order endpoint to determine the stpMode of a certain order.
> isElpTakerAccess	Boolean	No	ELP taker access
true: the request can trade with ELP orders but a speed bump will be applied
false: the request cannot trade with ELP orders and no speed bump

The default value is false while true is only applicable to ioc orders.
expTime	String	No	Request effective deadline. Unix timestamp format in milliseconds, e.g. 1597026383085
Successful Response Example

{
  "id": "1512",
  "op": "order",
  "data": [
    {
      "clOrdId": "",
      "ordId": "12345689",
      "tag": "",
      "ts":"1695190491421",
      "sCode": "0",
      "sMsg": ""
    }
  ],
  "code": "0",
  "msg": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Failure Response Example

{
  "id": "1512",
  "op": "order",
  "data": [
    {
      "clOrdId": "",
      "ordId": "",
      "tag": "",
      "ts":"1695190491421",
      "sCode": "5XXXX",
      "sMsg": "not exist"
    }
  ],
  "code": "1",
  "msg": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Example When Format Error

{
  "id": "1512",
  "op": "order",
  "data": [],
  "code": "60013",
  "msg": "Invalid args",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Parameters
Parameter	Type	Description
id	String	Unique identifier of the message
op	String	Operation
code	String	Error Code
msg	String	Error message
data	Array of objects	Data
> ordId	String	Order ID
> clOrdId	String	Client Order ID as assigned by the client
> tag	String	Order tag
> ts	String	Timestamp when the order request processing is finished by our system, Unix timestamp format in milliseconds, e.g. 1597026383085
> sCode	String	Order status code, 0 means success
> sMsg	String	Rejection or success message of event execution.
> subCode	String	Sub-code of sCode.
Returns "" when sCode is 0 (request successful).
When sCode is not 0 (request failed), returns the sub-code if available; otherwise returns "".
inTime	String	Timestamp at Websocket gateway when the request is received, Unix timestamp format in microseconds, e.g. 1597026383085123
outTime	String	Timestamp at Websocket gateway when the response is sent, Unix timestamp format in microseconds, e.g. 1597026383085123
 tdMode
Trade Mode, when placing an order, you need to specify the trade mode.
Spot mode:
- SPOT and OPTION buyer: cash
Futures mode:
- Isolated MARGIN: isolated
- Cross MARGIN: cross
- SPOT: cash
- Cross FUTURES/SWAP/OPTION: cross
- Isolated FUTURES/SWAP/OPTION: isolated
Multi-currency margin:
- Isolated MARGIN: isolated
- Cross SPOT: cross
- Cross FUTURES/SWAP/OPTION: cross
- Isolated FUTURES/SWAP/OPTION: isolated
Portfolio margin:
- Isolated MARGIN: isolated
- Cross SPOT: cross
- Cross FUTURES/SWAP/OPTION: cross
- Isolated FUTURES/SWAP/OPTION: isolated
 clOrdId
clOrdId is a user-defined unique order identifier at the User ID level. If provided in the request parameters, it will be included in the response and can be used as a request parameter to query, cancel, and amend orders.
clOrdId cannot duplicate any existing clOrdId of all current pending orders.
 posSide
Position side, this parameter is not mandatory in net mode. If you pass it through, the only valid value is net.
In long/short mode, it is mandatory. Valid values are long or short.
In long/short mode, side and posSide need to be specified in the combinations below:
Open long: buy and open long (side: fill in buy; posSide: fill in long)
Open short: sell and open short (side: fill in sell; posSide: fill in short)
Close long: sell and close long (side: fill in sell; posSide: fill in long)
Close short: buy and close short (side: fill in buy; posSide: fill in short)
Portfolio margin mode: Expiry Futures and Perpetual Futures only support net mode
 ordType
Order type. When creating a new order, you must specify the order type. The order type you specify will affect: 1) what order parameters are required, and 2) how the matching system executes your order. The following are valid order types:
limit: Limit order, which requires specified sz and px.
market: Market order. For SPOT and MARGIN, market order will be filled with market price (by swiping opposite order book). For Expiry Futures and Perpetual Futures, market order will be placed to order book with most aggressive price allowed by Price Limit Mechanism. For OPTION, market order is not supported yet. As the filled price for market orders cannot be determined in advance, OKX reserves/freezes your quote currency by an additional 5% for risk check.
post_only: Post-only order, which the order can only provide liquidity to the market and be a maker. If the order would have executed on placement, it will be canceled instead.
fok: Fill or kill order. If the order cannot be fully filled, the order will be canceled. The order would not be partially filled.
ioc: Immediate or cancel order. Immediately execute the transaction at the order price, cancel the remaining unfilled quantity of the order, and the order quantity will not be displayed in the order book.
optimal_limit_ioc: Market order with ioc (immediate or cancel). Immediately execute the transaction of this market order, cancel the remaining unfilled quantity of the order, and the order quantity will not be displayed in the order book. Only applicable to Expiry Futures and Perpetual Futures.
 sz
Quantity to buy or sell.
For SPOT/MARGIN Buy and Sell Limit Orders, it refers to the quantity in base currency.
For MARGIN Buy Market Orders, it refers to the quantity in quote currency.
For MARGIN Sell Market Orders, it refers to the quantity in base currency.
For SPOT Market Orders, it is set by tgtCcy.
For FUTURES/SWAP/OPTION orders, it refers to the number of contracts.
 reduceOnly
When placing an order with this parameter set to true, it means that the order will reduce the size of the position only
For the same MARGIN instrument, the coin quantity of all reverse direction pending orders adds `sz` of new `reduceOnly` order cannot exceed the position assets. After the debt is paid off, if there is a remaining size of orders, the position will not be opened in reverse, but will be traded in SPOT.
For the same FUTURES/SWAP instrument, the sum of the current order size and all reverse direction reduce-only pending orders which's price-time priority is higher than the current order, cannot exceed the contract quantity of position.
Only applicable to `Futures mode` and `Multi-currency margin`
Only applicable to `MARGIN` orders, and `FUTURES`/`SWAP` orders in `net` mode
Notice: Under long/short mode of Expiry Futures and Perpetual Futures, all closing orders apply the reduce-only feature which is not affected by this parameter.
 tgtCcy
This parameter is used to specify the order quantity in the order request is denominated in the quantity of base or quote currency. This is applicable to SPOT Market Orders only.
Base currency: base_ccy
Quote currency: quote_ccy
If you use the Base Currency quantity for buy market orders or the Quote Currency for sell market orders, please note:
1. If the quantity you enter is greater than what you can buy or sell, the system will execute the order according to your maximum buyable or sellable quantity. If you want to trade according to the specified quantity, you should use Limit orders.
2. When the market price is too volatile, the locked balance may not be sufficient to buy the Base Currency quantity or sell to receive the Quote Currency that you specified. We will change the quantity of the order to execute the order based on best effort principle based on your account balance. In addition, we will try to over lock a fraction of your balance to avoid changing the order quantity.
2.1 Example of base currency buy market order:
Taking the market order to buy 10 LTCs as an example, and the user can buy 11 LTC. At this time, if 10 < 11, the order is accepted. When the LTC-USDT market price is 200, and the locked balance of the user is 3,000 USDT, as 200*10 < 3,000, the market order of 10 LTC is fully executed; If the market is too volatile and the LTC-USDT market price becomes 400, 400*10 > 3,000, the user's locked balance is not sufficient to buy using the specified amount of base currency, the user's maximum locked balance of 3,000 USDT will be used to settle the trade. Final transaction quantity becomes 3,000/400 = 7.5 LTC.
2.2 Example of quote currency sell market order:
Taking the market order to sell 1,000 USDT as an example, and the user can sell 1,200 USDT, 1,000 < 1,200, the order is accepted. When the LTC-USDT market price is 200, and the locked balance of the user is 6 LTC, as 1,000/200 < 6, the market order of 1,000 USDT is fully executed; If the market is too volatile and the LTC-USDT market price becomes 100, 100*6 < 1,000, the user's locked balance is not sufficient to sell using the specified amount of quote currency, the user's maximum locked balance of 6 LTC will be used to settle the trade. Final transaction quantity becomes 6 * 100 = 600 USDT.
 px
The value for px must be a multiple of tickSz for OPTION orders.
If not, the system will apply the rounding rules below. Using tickSz 0.0005 as an example:
The px will be rounded up to the nearest 0.0005 when the remainder of px to 0.0005 is more than 0.00025 or `px` is less than 0.0005.
The px will be rounded down to the nearest 0.0005 when the remainder of px to 0.0005 is less than 0.00025 and `px` is more than 0.0005.
 Mandatory self trade prevention (STP)
The trading platform imposes mandatory self trade prevention at master account level, which means the accounts under the same master account, including master account itself and all its affiliated sub-accounts, will be prevented from self trade. The account-level acctStpMode will be used to place orders by default. The default value of this field is `cancel_maker`. Users can log in to the webpage through the master account to modify this configuration. Users can also utilize the stpMode request parameter of the placing order endpoint to determine the stpMode of a certain order.
Mandatory self trade prevention will not lead to latency.
There are three STP modes. The STP mode is always taken based on the configuration in the taker order.
1. Cancel Maker: This is the default STP mode, which cancels the maker order to prevent self-trading. Then, the taker order continues to match with the next order based on the order book priority.
2. Cancel Taker: The taker order is canceled to prevent self-trading. If the user's own maker order is lower in the order book priority, the taker order is partially filled and then canceled. FOK orders are always honored and canceled if they would result in self-trading.
3. Cancel Both: Both taker and maker orders are canceled to prevent self-trading. If the user's own maker order is lower in the order book priority, the taker order is partially filled. Then, the remaining quantity of the taker order and the first maker order are canceled. FOK orders are not supported in this mode.
 Rate limit of orders tagged as isElpTakerAccess:true
- 50 orders per 2 seconds per User ID per instrument ID.
- This rate limit is shared in Place order/Place multiple orders endpoints in REST/WebSocket
WS / Place multiple orders
Place orders in a batch. Maximum 20 orders can be placed per request


URL Path
/ws/v5/private (required login)

Rate Limit: 300 orders per 2 seconds
Rate Limit of lead trader lead instruments for Copy Trading: 4 orders per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
Rate limit of this endpoint will also be affected by the rules Sub-account rate limit and Fill ratio based sub-account rate limit.

 Unlike other endpoints, the rate limit of this endpoint is determined by the number of orders. If there is only one order in the request, it will consume the rate limit of `Place order`.
 Rate limit is shared with the `Place multiple orders` REST API endpoints
Request Example

{
  "id": "1513",
  "op": "batch-orders",
  "args": [
    {
      "side": "buy",
      "instIdCode": 123456,
      "tdMode": "cash",
      "ordType": "market",
      "sz": "100"
    },
    {
      "side": "buy",
      "instIdCode": 654321,
      "tdMode": "cash",
      "ordType": "market",
      "sz": "1"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	Yes	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
batch-orders
args	Array of objects	Yes	Request Parameters
> instIdCode	Integer	Yes	Instrument ID code.
> tdMode	String	Yes	Trade mode
Margin mode isolated cross
Non-Margin mode cash
spot_isolated (only applicable to SPOT lead trading, tdMode should be spot_isolated for SPOT lead trading.)
Note: isolated is not available in multi-currency margin mode and portfolio margin mode.
> ccy	String	No	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode.
> clOrdId	String	No	Client Order ID as assigned by the client
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
> tag	String	No	Order tag
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 16 characters.
> side	String	Yes	Order side, buy sell
> posSide	String	Conditional	Position side
The default net in the net mode
It is required in the long/short mode, and only be long or short.
Only applicable to FUTURES/SWAP.
> ordType	String	Yes	Order type
market: Market order, only applicable to SPOT/MARGIN/FUTURES/SWAP
limit: limit order
post_only: Post-only order
fok: Fill-or-kill order
ioc: Immediate-or-cancel order
optimal_limit_ioc: Market order with immediate-or-cancel order (applicable only to Expiry Futures and Perpetual Futures)
mmp: Market Maker Protection (only applicable to Option in Portfolio Margin mode)
mmp_and_post_only: Market Maker Protection and Post-only order(only applicable to Option in Portfolio Margin mode).
elp: Enhanced Liquidity Program order
> sz	String	Yes	Quantity to buy or sell.
> px	String	Conditional	Order price. Only applicable to limit,post_only,fok,ioc,mmp,mmp_and_post_only order.
When placing an option order, one of px/pxUsd/pxVol must be filled in, and only one can be filled in
> pxUsd	String	Conditional	Place options orders in USD
Only applicable to options
When placing an option order, one of px/pxUsd/pxVol must be filled in, and only one can be filled in
> pxVol	String	Conditional	Place options orders based on implied volatility, where 1 represents 100%
Only applicable to options
When placing an option order, one of px/pxUsd/pxVol must be filled in, and only one can be filled in
> reduceOnly	Boolean	No	Whether the order can only reduce the position size.
Valid options: true or false. The default value is false.
Only applicable to MARGIN orders, and FUTURES/SWAP orders in net mode
Only applicable to Futures mode and Multi-currency margin
> tgtCcy	String	No	Order quantity unit setting for sz
base_ccy: Base currency ,quote_ccy: Quote currency
Only applicable to SPOT Market Orders
Default is quote_ccy for buy, base_ccy for sell
> banAmend	Boolean	No	Whether to disallow the system from amending the size of the SPOT Market Order.
Valid options: true or false. The default value is false.
If true, system will not amend and reject the market order if user does not have sufficient funds.
Only applicable to SPOT Market Orders
> pxAmendType	String	No	The price amendment type for orders
0: Do not allow the system to amend to order price if px exceeds the price limit
1: Allow the system to amend the price to the best available value within the price limit if px exceeds the price limit
The default value is 0
> tradeQuoteCcy	String	No	The quote currency used for trading. Only applicable to SPOT.
The default value is the quote currency of the instId, for example: for BTC-USD, the default is USD.
> isElpTakerAccess	Boolean	No	ELP taker access
true: the request can trade with ELP orders but a speed bump will be applied
false: the request cannot trade with ELP orders and no speed bump

The default value is false while true is only applicable to ioc orders.
> stpMode	String	No	Self trade prevention mode.
cancel_maker,cancel_taker, cancel_both
Cancel both does not support FOK.

The account-level acctStpMode will be used to place orders by default. The default value of this field is cancel_maker. Users can log in to the webpage through the master account to modify this configuration. Users can also utilize the stpMode request parameter of the placing order endpoint to determine the stpMode of a certain order.
expTime	String	No	Request effective deadline. Unix timestamp format in milliseconds, e.g. 1597026383085
Response Example When All Succeed

{
  "id": "1513",
  "op": "batch-orders",
  "data": [
    {
      "clOrdId": "",
      "ordId": "12345689",
      "tag": "",
      "ts": "1695190491421",
      "sCode": "0",
      "sMsg": "",
      "subCode": ""
    },
    {
      "clOrdId": "",
      "ordId": "12344",
      "tag": "",
      "ts": "1695190491421",
      "sCode": "0",
      "sMsg": "",
      "subCode": ""
    }
  ],
  "code": "0",
  "msg": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Example When Partially Successful

{
  "id": "1513",
  "op": "batch-orders",
  "data": [
    {
      "clOrdId": "",
      "ordId": "12345689",
      "tag": "",
      "ts": "1695190491421",
      "sCode": "0",
      "sMsg": "",
      "subCode": ""
    },
    {
      "clOrdId": "",
      "ordId": "",
      "tag": "",
      "ts": "1695190491421",
      "sCode": "51008",
      "sMsg": "Order failed. Insufficient USDT balance in account",
      "subCode": "1000"
    }
  ],
  "code": "2",
  "msg": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Example When All Failed

{
  "id": "1513",
  "op": "batch-orders",
  "data": [
    {
      "clOrdId": "oktswap6",
      "ordId": "",
      "tag": "",
      "ts": "1695190491421",
      "sCode": "51008",
      "sMsg": "Order failed. Insufficient USDT balance in account",
      "subCode": "1000"
    },
    {
      "clOrdId": "oktswap7",
      "ordId": "",
      "tag": "",
      "ts": "1695190491421",
      "sCode": "51008",
      "sMsg": "Order failed. Insufficient USDT balance in account",
      "subCode": "1000"
    }
  ],
  "code": "1",
  "msg": "",
  "subCode": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Example When Format Error

{
  "id": "1513",
  "op": "batch-orders",
  "data": [],
  "code": "60013",
  "msg": "Invalid args",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Parameters
Parameter	Type	Description
id	String	Unique identifier of the message
op	String	Operation
code	String	Error Code
msg	String	Error message
data	Array of objects	Data
> ordId	String	Order ID
> clOrdId	String	Client Order ID as assigned by the client
> tag	String	Order tag
> ts	String	Timestamp when the order request processing is finished by our system, Unix timestamp format in milliseconds, e.g. 1597026383085
> sCode	String	Order status code, 0 means success
> sMsg	String	Rejection or success message of event execution.
> subCode	String	Sub-code of sCode.
Returns "" when sCode is 0 (request successful).
When sCode is not 0 (request failed), returns the sub-code if available; otherwise returns "".
inTime	String	Timestamp at Websocket gateway when the request is received, Unix timestamp format in microseconds, e.g. 1597026383085123
outTime	String	Timestamp at Websocket gateway when the response is sent, Unix timestamp format in microseconds, e.g. 1597026383085123
 In the `Portfolio Margin` account mode, either all orders are accepted by the system successfully, or all orders are rejected by the system.
 clOrdId
clOrdId is a user-defined unique ID used to identify the order. It will be included in the response parameters if you have specified during order submission, and can be used as a request parameter to the endpoints to query, cancel and amend orders.
clOrdId must be unique among all pending orders and the current request.
 Rate limit of orders tagged as isElpTakerAccess:true
- 50 orders per 2 seconds per User ID per instrument ID.
- This rate limit is shared in Place order/Place multiple orders endpoints in REST/WebSocket
WS / Cancel order
Cancel an incomplete order

URL Path
/ws/v5/private (required login)

Rate Limit: 60 requests per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
 Rate limit is shared with the `Cancel order` REST API endpoints
Request Example

{
  "id": "1514",
  "op": "cancel-order",
  "args": [
    {
      "instIdCode": 123456,
      "ordId": "2510789768709120"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	Yes	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
cancel-order
args	Array of objects	Yes	Request Parameters
> instIdCode	Integer	Yes	Instrument ID code
> ordId	String	Conditional	Order ID
Either ordId or clOrdId is required, if both are passed, ordId will be used
> clOrdId	String	Conditional	Client Order ID as assigned by the client
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
Successful Response Example

{
  "id": "1514",
  "op": "cancel-order",
  "data": [
    {
      "clOrdId": "",
      "ordId": "2510789768709120",
      "ts": "1695190491421",
      "sCode": "0",
      "sMsg": ""
    }
  ],
  "code": "0",
  "msg": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Failure Response Example

{
  "id": "1514",
  "op": "cancel-order",
  "data": [
    {
      "clOrdId": "",
      "ordId": "2510789768709120",
      "ts": "1695190491421",
      "sCode": "5XXXX",
      "sMsg": "Order not exist"
    }
  ],
  "code": "1",
  "msg": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Example When Format Error

{
  "id": "1514",
  "op": "cancel-order",
  "data": [],
  "code": "60013",
  "msg": "Invalid args",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Parameters
Parameter	Type	Description
id	String	Unique identifier of the message
op	String	Operation
code	String	Error Code
msg	String	Error message
data	Array of objects	Data
> ordId	String	Order ID
> clOrdId	String	Client Order ID as assigned by the client
> ts	String	Timestamp when the order request processing is finished by our system, Unix timestamp format in milliseconds, e.g. 1597026383085
> sCode	String	Order status code, 0 means success
> sMsg	String	Order status message
inTime	String	Timestamp at Websocket gateway when the request is received, Unix timestamp format in microseconds, e.g. 1597026383085123
outTime	String	Timestamp at Websocket gateway when the response is sent, Unix timestamp format in microseconds, e.g. 1597026383085123
 Cancel order returns with sCode equal to 0. It is not strictly considered that the order has been canceled. It only means that your cancellation request has been accepted by the system server. The result of the cancellation is subject to the state pushed by the order channel or the get order state.
WS / Cancel multiple orders
Cancel incomplete orders in batches. Maximum 20 orders can be canceled per request.

URL Path
/ws/v5/private (required login)

Rate Limit: 300 orders per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
 Unlike other endpoints, the rate limit of this endpoint is determined by the number of orders. If there is only one order in the request, it will consume the rate limit of `Cancel order`.
 Rate limit is shared with the `Cancel multiple orders` REST API endpoints
Request Example

{
  "id": "1515",
  "op": "batch-cancel-orders",
  "args": [
    {
      "instIdCode": 123456,
      "ordId": "2517748157541376"
    },
    {
      "instIdCode": 654321,
      "ordId": "2517748155771904"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	Yes	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
batch-cancel-orders
args	Array of objects	Yes	Request Parameters
> instIdCode	Integer	Yes	Instrument ID code
> ordId	String	Conditional	Order ID
Either ordId or clOrdId is required, if both are passed, ordId will be used
> clOrdId	String	Conditional	Client Order ID as assigned by the client
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
Response Example When All Succeed

{
  "id": "1515",
  "op": "batch-cancel-orders",
  "data": [
    {
      "clOrdId": "oktswap6",
      "ordId": "2517748157541376",
      "ts": "1695190491421",
      "sCode": "0",
      "sMsg": ""
    },
    {
      "clOrdId": "oktswap7",
      "ordId": "2517748155771904",
      "ts": "1695190491421",
      "sCode": "0",
      "sMsg": ""
    }
  ],
  "code": "0",
  "msg": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Example When partially successfully

{
  "id": "1515",
  "op": "batch-cancel-orders",
  "data": [
    {
      "clOrdId": "oktswap6",
      "ordId": "2517748157541376",
      "ts": "1695190491421",
      "sCode": "0",
      "sMsg": ""
    },
    {
      "clOrdId": "oktswap7",
      "ordId": "2517748155771904",
      "ts": "1695190491421",
      "sCode": "5XXXX",
      "sMsg": "order not exist"
    }
  ],
  "code": "2",
  "msg": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Example When All Failed

{
  "id": "1515",
  "op": "batch-cancel-orders",
  "data": [
    {
      "clOrdId": "oktswap6",
      "ordId": "2517748157541376",
      "ts": "1695190491421",
      "sCode": "5XXXX",
      "sMsg": "order not exist"
    },
    {
      "clOrdId": "oktswap7",
      "ordId": "2517748155771904",
      "ts": "1695190491421",
      "sCode": "5XXXX",
      "sMsg": "order not exist"
    }
  ],
  "code": "1",
  "msg": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Example When Format Error

{
  "id": "1515",
  "op": "batch-cancel-orders",
  "data": [],
  "code": "60013",
  "msg": "Invalid args",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Parameters
Parameter	Type	Description
id	String	Unique identifier of the message
op	String	Operation
code	String	Error Code
msg	String	Error message
data	Array of objects	Data
> ordId	String	Order ID
> clOrdId	String	Client Order ID as assigned by the client
> ts	String	Timestamp when the order request processing is finished by our system, Unix timestamp format in milliseconds, e.g. 1597026383085
> sCode	String	Order status code, 0 means success
> sMsg	String	Order status message
inTime	String	Timestamp at Websocket gateway when the request is received, Unix timestamp format in microseconds, e.g. 1597026383085123
outTime	String	Timestamp at Websocket gateway when the response is sent, Unix timestamp format in microseconds, e.g. 1597026383085123
WS / Amend order
Amend an incomplete order.

URL Path
/ws/v5/private (required login)

Rate Limit: 60 requests per 2 seconds
Rate Limit of lead trader lead instruments for Copy Trading: 4 requests per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
Rate limit of this endpoint will also be affected by the rules Sub-account rate limit and Fill ratio based sub-account rate limit.

 Rate limit is shared with the `Amend order` REST API endpoints
Request Example

{
  "id": "1512",
  "op": "amend-order",
  "args": [
    {
      "instIdCode": 123456,
      "ordId": "2510789768709120",
      "newSz": "2"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	Yes	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
amend-order
args	Array of objects	Yes	Request Parameters
> instIdCode	Integer	Yes	Instrument ID code
> cxlOnFail	Boolean	No	Whether the order needs to be automatically canceled when the order amendment fails
Valid options: false or true, the default is false.
> ordId	String	Conditional	Order ID
Either ordId or clOrdId is required, if both are passed, ordId will be used.
> clOrdId	String	Conditional	Client Order ID as assigned by the client
> reqId	String	No	Client Request ID as assigned by the client for order amendment
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
> newSz	String	Conditional	New quantity after amendment and it has to be larger than 0. Either newSz or newPx is required. When amending a partially-filled order, the newSz should include the amount that has been filled.
> newPx	String	Conditional	New price after amendment.
When modifying options orders, users can only fill in one of the following: newPx, newPxUsd, or newPxVol. It must be consistent with parameters when placing orders. For example, if users placed the order using px, they should use newPx when modifying the order.
> newPxUsd	String	Conditional	Modify options orders using USD prices
Only applicable to options.
When modifying options orders, users can only fill in one of the following: newPx, newPxUsd, or newPxVol.
> newPxVol	String	Conditional	Modify options orders based on implied volatility, where 1 represents 100%
Only applicable to options.
When modifying options orders, users can only fill in one of the following: newPx, newPxUsd, or newPxVol.
> pxAmendType	String	No	The price amendment type for orders
0: Do not allow the system to amend to order price if newPx exceeds the price limit
1: Allow the system to amend the price to the best available value within the price limit if newPx exceeds the price limit
The default value is 0
expTime	String	No	Request effective deadline. Unix timestamp format in milliseconds, e.g. 1597026383085
Successful Response Example

{
  "id": "1512",
  "op": "amend-order",
  "data": [
    {
      "clOrdId": "",
      "ordId": "2510789768709120",
      "ts": "1695190491421",
      "reqId": "b12344",
      "sCode": "0",
      "sMsg": "",
      "subCode": ""
    }
  ],
  "code": "0",
  "msg": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Failure Response Example

{
  "id": "1512",
  "op": "amend-order",
  "data": [
    {
      "clOrdId": "",
      "ordId": "2510789768709120",
      "ts": "1695190491421",
      "reqId": "b12344",
      "sCode": "51008",
      "sMsg": "Order failed. Insufficient USDT balance in account",
      "subCode": "10000"
    }
  ],
  "code": "1",
  "msg": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Example When Format Error

{
  "id": "1512",
  "op": "amend-order",
  "data": [],
  "code": "60013",
  "msg": "Invalid args",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Parameters
Parameter	Type	Description
id	String	Unique identifier of the message
op	String	Operation
code	String	Error Code
msg	String	Error message
data	Array of objects	Data
> ordId	String	Order ID
> clOrdId	String	Client Order ID as assigned by the client
> ts	String	Timestamp when the order request processing is finished by our system, Unix timestamp format in milliseconds, e.g. 1597026383085
> reqId	String	Client Request ID as assigned by the client for order amendment
> sCode	String	Order status code, 0 means success
> sMsg	String	Order status message
> subCode	String	Sub-code of sCode.
Returns "" when sCode is 0 (request successful).
When sCode is not 0 (request failed), returns the sub-code if available; otherwise returns "".
inTime	String	Timestamp at Websocket gateway when the request is received, Unix timestamp format in microseconds, e.g. 1597026383085123
outTime	String	Timestamp at Websocket gateway when the response is sent, Unix timestamp format in microseconds, e.g. 1597026383085123
 newSz
If the new quantity of the order is less than or equal to the filled quantity when you are amending a partially-filled order, the order status will be changed to filled.
 The amend order returns sCode equal to 0. It is not strictly considered that the order has been amended. It only means that your amend order request has been accepted by the system server. The result of the amend is subject to the status pushed by the order channel or the order status query
WS / Amend multiple orders
Amend incomplete orders in batches. Maximum 20 orders can be amended per request.

URL Path
/ws/v5/private (required login)

Rate Limit: 300 orders per 2 seconds
Rate Limit of lead trader lead instruments for Copy Trading: 4 orders per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
Rate limit of this endpoint will also be affected by the rules Sub-account rate limit and Fill ratio based sub-account rate limit.

 Unlike other endpoints, the rate limit of this endpoint is determined by the number of orders. If there is only one order in the request, it will consume the rate limit of `Amend order`.
 Rate limit is shared with the `Amend multiple orders` REST API endpoints
Request Example

{
  "id": "1513",
  "op": "batch-amend-orders",
  "args": [
    {
      "instIdCode": 123456,
      "ordId": "12345689",
      "newSz": "2"
    },
    {
      "instIdCode": 123456,
      "ordId": "12344",
      "newSz": "2"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	Yes	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
batch-amend-orders
args	Array of objects	Yes	Request Parameters
> instIdCode	Integer	Yes	Instrument ID code
> cxlOnFail	Boolean	No	Whether the order needs to be automatically canceled when the order amendment fails
Valid options: false or true, the default is false.
> ordId	String	Conditional	Order ID
Either ordId or clOrdId is required, if both are passed, ordId will be used.
> clOrdId	String	Conditional	Client Order ID as assigned by the client
> reqId	String	No	Client Request ID as assigned by the client for order amendment
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
> newSz	String	Conditional	New quantity after amendment and it has to be larger than 0. Either newSz or newPx is required. When amending a partially-filled order, the newSz should include the amount that has been filled.
> newPx	String	Conditional	New price after amendment.
When modifying options orders, users can only fill in one of the following: newPx, newPxUsd, or newPxVol. It must be consistent with parameters when placing orders. For example, if users placed the order using px, they should use newPx when modifying the order.
> newPxUsd	String	Conditional	Modify options orders using USD prices
Only applicable to options.
When modifying options orders, users can only fill in one of the following: newPx, newPxUsd, or newPxVol.
> newPxVol	String	Conditional	Modify options orders based on implied volatility, where 1 represents 100%
Only applicable to options.
When modifying options orders, users can only fill in one of the following: newPx, newPxUsd, or newPxVol.
> pxAmendType	String	No	The price amendment type for orders
0: Do not allow the system to amend to order price if newPx exceeds the price limit
1: Allow the system to amend the price to the best available value within the price limit if newPx exceeds the price limit
The default value is 0
expTime	String	No	Request effective deadline. Unix timestamp format in milliseconds, e.g. 1597026383085
Response Example When All Succeed

{
  "id": "1513",
  "op": "batch-amend-orders",
  "data": [
    {
      "clOrdId": "oktswap6",
      "ordId": "12345689",
      "ts": "1695190491421",
      "reqId": "b12344",
      "sCode": "0",
      "sMsg": "",
      "subCode": ""
    },
    {
      "clOrdId": "oktswap7",
      "ordId": "12344",
      "ts": "1695190491421",
      "reqId": "b12344",
      "sCode": "0",
      "sMsg": "",
      "subCode": ""
    }
  ],
  "code": "0",
  "msg": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Example When All Failed

{
  "id": "1513",
  "op": "batch-amend-orders",
  "data": [
    {
      "clOrdId": "",
      "ordId": "12345689",
      "ts": "1695190491421",
      "reqId": "b12344",
      "sCode": "5XXXX",
      "sMsg": "order not exist"
    },
    {
      "clOrdId": "oktswap7",
      "ordId": "",
      "ts": "1695190491421",
      "reqId": "b12344",
          "sCode": "51008",
      "sMsg": "Order failed. Insufficient USDT balance in account",
      "subCode": "1000"
    }
  ],
  "code": "1",
  "msg": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Example When Partially Successful

{
  "id": "1513",
  "op": "batch-amend-orders",
  "data": [
    {
      "clOrdId": "",
      "ordId": "12345689",
      "ts": "1695190491421",
      "reqId": "b12344",
      "sCode": "0",
      "sMsg": ""
    },
    {
      "clOrdId": "",
      "ordId": "oktswap7",
      "ts": "1695190491421",
      "reqId": "b12344",
      "sCode": "51063",
      "sMsg": "OrdId does not exist"
      "subCode": ""
    }
  ],
  "code": "2",
  "msg": "",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Example When Format Error

{
  "id": "1513",
  "op": "batch-amend-orders",
  "data": [],
  "code": "60013",
  "msg": "Invalid args",
  "inTime": "1695190491421339",
  "outTime": "1695190491423240"
}
Response Parameters
Parameter	Type	Description
id	String	Unique identifier of the message
op	String	Operation
code	String	Error Code
msg	String	Error message
data	Array of objects	Data
> ordId	String	Order ID
> clOrdId	String	Client Order ID as assigned by the client
> ts	String	Timestamp when the order request processing is finished by our system, Unix timestamp format in milliseconds, e.g. 1597026383085
> reqId	String	Client Request ID as assigned by the client for order amendment
If the user provides reqId in the request, the corresponding reqId will be returned
> sCode	String	Order status code, 0 means success
> sMsg	String	Order status message
> subCode	String	Sub-code of sCode.
Returns "" when sCode is 0 (request successful).
When sCode is not 0 (request failed), returns the sub-code if available; otherwise returns "".
inTime	String	Timestamp at Websocket gateway when the request is received, Unix timestamp format in microseconds, e.g. 1597026383085123
outTime	String	Timestamp at Websocket gateway when the response is sent, Unix timestamp format in microseconds, e.g. 1597026383085123
 newSz
If the new quantity of the order is less than or equal to the filled quantity when you are amending a partially-filled order, the order status will be changed to filled.
Algo Trading
POST / Place algo order
The algo order includes trigger order, oco order, chase order, conditional order, twap order and trailing order.

Rate Limit: 20 requests per 2 seconds
Rate Limit of lead trader lead instruments for Copy Trading: 1 request per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
Permission: Trade
HTTP Request
POST /api/v5/trade/order-algo

Request Example

# Place Take Profit / Stop Loss Order
POST /api/v5/trade/order-algo
body
{
    "instId":"BTC-USDT",
    "tdMode":"cross",
    "side":"buy",
    "ordType":"conditional",
    "sz":"2",
    "tpTriggerPx":"15",
    "tpOrdPx":"18"
}

# Place Trigger Order
POST /api/v5/trade/order-algo
body
{
    "instId": "BTC-USDT-SWAP",
    "side": "buy",
    "tdMode": "cross",
    "posSide": "net",
    "sz": "1",
    "ordType": "trigger",
    "triggerPx": "25920",
    "triggerPxType": "last",
    "orderPx": "-1",
    "attachAlgoOrds": [{
        "attachAlgoClOrdId": "",
        "slTriggerPx": "100",
        "slOrdPx": "600",
        "tpTriggerPx": "25921",
        "tpOrdPx": "2001"
    }]
}

# Place Trailing Stop Order
POST /api/v5/trade/order-algo
body
{
    "instId": "BTC-USDT-SWAP",
    "tdMode": "cross",
    "side": "buy",
    "ordType": "move_order_stop",
    "sz": "10",
    "posSide": "net",
    "callbackRatio": "0.05",
    "reduceOnly": true
}

# Place TWAP Order
POST /api/v5/trade/order-algo
body
{
    "instId": "BTC-USDT-SWAP",
    "tdMode": "cross",
    "side": "buy",
    "ordType": "twap",
    "sz": "10",
    "posSide": "net",
    "szLimit": "10",
    "pxLimit": "100",
    "timeInterval": "10",
    "pxSpread": "10"
}

# Iceberg order
POST /api/v5/trade/order-algo
body
{
    "instId": "BTC-USDT",
    "tdMode": "cash",
    "side": "buy",
    "ordType": "smart_iceberg",
    "sz": "100",
    "szLimit": "10",
    "lmtOrderNumber": "5",
    "aggressiveness": "2",
    "pxLimit": "95000",
    "triggerParams": [
        {
            "triggerAction": "start",
            "triggerStrategy": "price",
            "triggerPx": "90000",
            "triggerCond": "cross_down"
        }
    ]
}

Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USDT
tdMode	String	Yes	Trade mode
Margin mode cross isolated
Non-Margin mode cash
spot_isolated (only applicable to SPOT lead trading)
Note: isolated is not available in multi-currency margin mode and portfolio margin mode.
ccy	String	No	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode.
side	String	Yes	Order side, buy sell
posSide	String	Conditional	Position side
Required in long/short mode and only be long or short
ordType	String	Yes	Order type
conditional: One-way stop order
oco: One-cancels-the-other order
chase: chase order, only applicable to FUTURES and SWAP
trigger: Trigger order
move_order_stop: Trailing order
twap: TWAP order
smart_iceberg: Iceberg order
sz	String	Conditional	Quantity to buy or sell
Either sz or closeFraction is required.
tag	String	No	Order tag
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 16 characters.
tgtCcy	String	No	Order quantity unit setting for sz
base_ccy: Base currency ,quote_ccy: Quote currency
Only applicable to SPOT traded with Market buy conditional order
Default is quote_ccy for buy, base_ccy for sell
algoClOrdId	String	No	Client-supplied Algo ID
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
closeFraction	String	Conditional	Fraction of position to be closed when the algo order is triggered.
Currently the system supports fully closing the position only so the only accepted value is 1. For the same position, only one TPSL pending order for fully closing the position is supported.
This is only applicable to FUTURES or SWAP instruments.
If posSide is net, reduceOnly must be true.
This is only applicable if ordType is conditional or oco.
This is only applicable if the stop loss and take profit order is executed as market order.
This is not supported in Portfolio Margin mode.
Either sz or closeFraction is required.
tradeQuoteCcy	String	No	The quote currency used for trading. Only applicable to SPOT.
The default value is the quote currency of the instId, for example: for BTC-USD, the default is USD.
Take Profit / Stop Loss Order

 Predefine the price you want the order to trigger a market order to execute immediately or it will place a limit order.
This type of order will not freeze your free margin in advance.
learn more about Take Profit / Stop Loss Order

Parameter	Type	Required	Description
tpTriggerPx	String	No	Take-profit trigger price
If you fill in this parameter, you should fill in the take-profit order price as well.
tpTriggerPxType	String	No	Take-profit trigger price type
last: last price
index: index price
mark: mark price
The default is last
tpOrdPx	String	No	Take-profit order price
For condition TP order, if you fill in this parameter, you should fill in the take-profit trigger price as well.
For limit TP order, you need to fill in this parameter, but the take-profit trigger price doesn’t need to be filled.
If the price is -1, take-profit will be executed at the market price.
tpOrdKind	String	No	TP order kind
condition
limit
The default is condition
slTriggerPx	String	No	Stop-loss trigger price
If you fill in this parameter, you should fill in the stop-loss order price.
slTriggerPxType	String	No	Stop-loss trigger price type
last: last price
index: index price
mark: mark price
The default is last
slOrdPx	String	No	Stop-loss order price
If you fill in this parameter, you should fill in the stop-loss trigger price.
If the price is -1, stop-loss will be executed at the market price.
cxlOnClosePos	Boolean	No	Whether the TP/SL order placed by the user is associated with the corresponding position of the instrument. If it is associated, the TP/SL order will be canceled when the position is fully closed; if it is not, the TP/SL order will not be affected when the position is fully closed.
Valid values:
true: Place a TP/SL order associated with the position
false: Place a TP/SL order that is not associated with the position
The default value is false. If true is passed in, users must pass reduceOnly = true as well, indicating that when placing a TP/SL order associated with a position, it must be a reduceOnly order.
Only applicable to Futures mode and Multi-currency margin.
reduceOnly	Boolean	No	Whether the order can only reduce the position size.
Valid options: true or false. The default value is false.
 Take Profit / Stop Loss Order
When placing net TP/SL order (ordType=conditional) and both take-profit and stop-loss parameters are sent, only stop-loss logic will be performed and take-profit logic will be ignored.
Chase order

 It will place a Post Only order immediately and amend it continuously
Chase order and corresponding Post Only order can't be amended.
Parameter	Type	Required	Description
chaseType	String	No	Chase type.
distance: distance from best bid/ask price, the default value.
ratio: ratio.
chaseVal	String	No	Chase value.
It represents distance from best bid/ask price when chaseType is distance.
For USDT-margined contract, the unit is USDT.
For USDC-margined contract, the unit is USDC.
For Crypto-margined contract, the unit is USD.
It represents ratio when chaseType is ratio. 0.1 represents 10%.
The default value is 0.
maxChaseType	String	Conditional	Maximum chase type.
distance: maximum distance from best bid/ask price
ratio: the ratio.

maxChaseTyep and maxChaseVal need to be used together or none of them.
maxChaseVal	String	Conditional	Maximum chase value.
It represents maximum distance when maxChaseType is distance.
It represents ratio when maxChaseType is ratio. 0.1 represents 10%.
reduceOnly	Boolean	No	Whether the order can only reduce the position size.
Valid options: true or false. The default value is false.
Trigger Order

 Use a trigger order to place a market or limit order when a specific price level is crossed.
When a Trigger Order is triggered, if your account balance is lower than the order amount, the system will automatically place the order based on your current balance.
Trigger orders do not freeze assets when placed.
Only applicable to SPOT/FUTURES/SWAP
learn more about Trigger Order

Parameter	Type	Required	Description
triggerPx	String	Yes	Trigger price
orderPx	String	Yes	Order Price
If the price is -1, the order will be executed at the market price.
advanceOrdType	String	No	Trigger order type
fok: Fill-or-kill order
ioc: Immediate-or-cancel order
Default is "", limit or market (controlled by orderPx)
triggerPxType	String	No	Trigger price type
last: last price
index: index price
mark: mark price
The default is last
attachAlgoOrds	Array of objects	No	Attached TP/SL or trailing stop order info
Applicable to Futures mode/Multi-currency margin/Portfolio margin
> attachAlgoClOrdId	String	No	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
It will be posted to algoClOrdId when placing the attached algo order once the general order is filled completely.
> tpTriggerPx	String	No	Take-profit trigger price
If you fill in this parameter, you should fill in the take-profit order price as well.
> tpTriggerRatio	String	No	Take profit trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
Only one of tpTriggerPx and tpTriggerRatio can be passed
If the main order is a buy order, it must be greater than 0, and if the main order is a sell order, it must be between -1 and 0.
> tpTriggerPxType	String	No	Take-profit trigger price type
last: last price
index: index price
mark: mark price
The default is last
> tpOrdPx	String	No	Take-profit order price
If you fill in this parameter, you should fill in the take-profit trigger price as well.
If the price is -1, take-profit will be executed at the market price.
> slTriggerPx	String	No	Stop-loss trigger price
If you fill in this parameter, you should fill in the stop-loss order price.
> slTriggerRatio	String	No	Stop-loss trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
Only one of slTriggerPx and slTriggerRatio can be passed
If the main order is a buy order, it must be between 0 and 1, and if the main order is a sell order, it must be greater than 0.
> slTriggerPxType	String	No	Stop-loss trigger price type
last: last price
index: index price
mark: mark price
The default is last
> slOrdPx	String	No	Stop-loss order price
If you fill in this parameter, you should fill in the stop-loss trigger price.
If the price is -1, stop-loss will be executed at the market price.
> callbackRatio	String	Conditional	Callback ratio, e.g. 0.05 represents 5%.
Either callbackRatio or callbackSpread is required. Only one can be passed.
Only applicable when ordType = move_order_stop
> callbackSpread	String	Conditional	Callback spread (price distance).
Either callbackRatio or callbackSpread is required. Only one can be passed.
Only applicable when ordType = move_order_stop
> activePx	String	No	Activation price.
The trailing stop is activated when the market price reaches the activation price. After activation, the system starts calculating the actual trigger price. If not provided, the trailing stop is activated immediately upon order placement.
Only applicable when ordType = move_order_stop
Trailing Stop Order

 A trailing stop order is a stop order that tracks the market price. Its trigger price changes with the market price. Once the trigger price is reached, a market order is placed.
Actual trigger price for sell orders and short positions = Highest price after order placement – Trail variance (Var.), or Highest price after placement × (1 – Trail variance) (Ratio).
Actual trigger price for buy orders and long positions = Lowest price after order placement + Trail variance, or Lowest price after order placement × (1 + Trail variance).
You can use the activation price to set the activation condition for a trailing stop order.
learn more about Trailing Stop Order

Parameter	Type	Required	Description
callbackRatio	String	Conditional	Callback price ratio, e.g. 0.01 represents 1%
Either callbackRatio or callbackSpread is allowed to be passed.
callbackSpread	String	Conditional	Callback price variance
activePx	String	No	Active price
The system will only start tracking the market and calculating your trigger price after the activation price is reached. If you don’t set a price, your order will be activated as soon as it’s placed.
reduceOnly	Boolean	No	Whether the order can only reduce the position size.
Valid options: true or false. The default value is false.
This parameter is only valid in the FUTRUES/SWAP net mode, and is ignored in the long/short mode.
TWAP Order

 Time-weighted average price (TWAP) strategy splits your order and places smaller orders at regular time intervals.
It is a strategy that will attempt to execute an order which trades in slices of order quantity at regular intervals of time as specified by users.
learn more about TWAP Order

Parameter	Type	Required	Description
pxVar	String	Conditional	Price variance by percentage, range between [0.0001 ~ 0.01], e.g. 0.01 represents 1%
Take buy orders as an example. When the market price is lower than the limit price, small buy orders will be placed above the best bid price within a certain range. This parameter determines the range by percentage.
Either pxVar or pxSpread is allowed to be passed.
pxSpread	String	Conditional	Price variance by constant, should be no less then 0 (no upper limit)
Take buy orders as an example. When the market price is lower than the limit price, small buy orders will be placed above the best bid price within a certain range. This parameter determines the range by constant.
szLimit	String	Yes	Average amount
Take buy orders as an example. When the market price is lower than the limit price, a certain amount of buy orders will be placed above the best bid price within a certain range. This parameter determines the amount.
pxLimit	String	Yes	Price Limit, should be no less then 0 (no upper limit)
Take buy orders as an example. When the market price is lower than the limit price, small buy orders will be placed above the best bid price within a certain range. This parameter represents the limit price.
timeInterval	String	Yes	Time interval in unit of second
ake buy orders as an example. When the market price is lower than the limit price, small buy orders will be placed above the best bid price within a certain range based on the time cycle. This parameter represents the time cycle.
Iceberg Order

Parameter	Type	Required	Description
szLimit	String	Yes	Minimum order size per execution. Only applicable to smart_iceberg
lmtOrderNumber	String	Yes	Number of limit order splits. Only applicable to smart_iceberg
aggressiveness	String	Yes	Aggressiveness level. Only applicable to smart_iceberg
1: Faster fill
2: Faster fill with better price
3: Queue at best bid/ask
pxLimit	String	No	Price limit. Only applicable to smart_iceberg
triggerParams	Array of objects	No	Trigger parameters. If the list is empty, the order is triggered immediately by default. Only applicable to smart_iceberg
> triggerAction	String	Yes	Trigger action
start: Start iceberg order
> triggerStrategy	String	Yes	Trigger strategy
instant: Trigger immediately
price: Trigger by price
rsi: Trigger by RSI indicator
Default is instant
> triggerPx	String	No	Trigger price
Only valid when triggerStrategy is price
> triggerCond	String	No	Trigger condition
cross_up / cross_down / above / below / cross
Only valid when triggerStrategy is rsi
> timeframe	String	No	K-line type: 3m / 5m / 15m / 30m / 1H / 4H / 1D
Only valid when triggerStrategy is rsi
> thold	String	No	Threshold, range [1, 100]
Only valid when triggerStrategy is rsi
> timePeriod	String	No	RSI calculation period. Default and fixed value is 14. Only valid when triggerStrategy is rsi
Response Example

{
    "code": "0",
    "data": [
        {
            "algoClOrdId": "order1234",
            "algoId": "1836487817828872192",
            "clOrdId": "",
            "sCode": "0",
            "sMsg": "",
            "tag": ""
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
algoId	String	Algo ID
clOrdId	String	Client Order ID as assigned by the client(Deprecated)
algoClOrdId	String	Client-supplied Algo ID
sCode	String	The code of the event execution result, 0 means success.
sMsg	String	Rejection message if the request is unsuccessful.
tag	String	Order tag
POST / Cancel algo order
Cancel unfilled algo orders. A maximum of 10 orders can be canceled per request. Request parameters should be passed in the form of an array.

Rate Limit: 20 orders per 2 seconds
Rate limit rule (except Options): User ID + Instrument ID
Rate limit rule (Options only): User ID + Instrument Family
Permission: Trade
HTTP Request
POST /api/v5/trade/cancel-algos

Request Example

POST /api/v5/trade/cancel-algos
body
[
    {
        "algoId":"590919993110396111",
        "instId":"BTC-USDT"
    },
    {
        "algoId":"590920138287841222",
        "instId":"BTC-USDT"
    }
]
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USDT
algoId	String	Conditional	Algo ID
Either algoId or algoClOrdId is required. If both are passed, algoId will be used.
algoClOrdId	String	Conditional	Client-supplied Algo ID
Either algoId or algoClOrdId is required. If both are passed, algoId will be used.
Response Example

{
    "code": "0",
    "data": [
        {
            "algoClOrdId": "",
            "algoId": "1836489397437468672",
            "clOrdId": "",
            "sCode": "0",
            "sMsg": "",
            "tag": ""
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
algoId	String	Algo ID
sCode	String	The code of the event execution result, 0 means success.
sMsg	String	Rejection message if the request is unsuccessful.
clOrdId	String	Client Order ID as assigned by the client(Deprecated)
algoClOrdId	String	Client-supplied Algo ID(Deprecated)
tag	String	Order tag (Deprecated)
POST / Amend algo order
Amend unfilled algo orders (Support Stop order and Trigger order only, not including Move_order_stop order, Iceberg order, TWAP order, Trailing Stop order).

Rate Limit: 20 requests per 2 seconds
Rate limit rule: User ID + Instrument ID
Permission: Trade
HTTP Request
POST /api/v5/trade/amend-algos

Request Example

POST /api/v5/trade/amend-algos
body
{
    "algoId":"2510789768709120",
    "newSz":"2",
    "instId":"BTC-USDT"
}
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID
algoId	String	Conditional	Algo ID
Either algoId or algoClOrdId is required. If both are passed, algoId will be used.
algoClOrdId	String	Conditional	Client-supplied Algo ID
Either algoId or algoClOrdId is required. If both are passed, algoId will be used.
cxlOnFail	Boolean	No	Whether the order needs to be automatically canceled when the order amendment fails
Valid options: false or true, the default is false.
reqId	String	Conditional	Client Request ID as assigned by the client for order amendment
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
The response will include the corresponding reqId to help you identify the request if you provide it in the request.
newSz	String	Conditional	New quantity after amendment and it has to be larger than 0.
Take Profit / Stop Loss Order

Parameter	Type	Required	Description
newTpTriggerPx	String	Conditional	Take-profit trigger price.
Either the take-profit trigger price or order price is 0, it means that the take-profit is deleted
newTpOrdPx	String	Conditional	Take-profit order price
If the price is -1, take-profit will be executed at the market price.
newSlTriggerPx	String	Conditional	Stop-loss trigger price.
Either the stop-loss trigger price or order price is 0, it means that the stop-loss is deleted
newSlOrdPx	String	Conditional	Stop-loss order price
If the price is -1, stop-loss will be executed at the market price.
newTpTriggerPxType	String	Conditional	Take-profit trigger price type
last: last price
index: index price
mark: mark price
newSlTriggerPxType	String	Conditional	Stop-loss trigger price type
last: last price
index: index price
mark: mark price
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
        {
            "algoClOrdId":"algo_01",
            "algoId":"2510789768709120",
            "reqId":"po103ux",
            "sCode":"0",
            "sMsg":""
        }
    ]
}
Response Parameters
Parameter	Type	Description
algoId	String	Algo ID
algoClOrdId	String	Client-supplied Algo ID
reqId	String	Client Request ID as assigned by the client for order amendment.
sCode	String	The code of the event execution result, 0 means success.
sMsg	String	Rejection message if the request is unsuccessful.
GET / Algo order details
Rate Limit: 20 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/trade/order-algo

Request Example

GET /api/v5/trade/order-algo?algoId=1753184812254216192
Request Parameters
Parameter	Type	Required	Description
algoId	String	Conditional	Algo ID
Either algoId or algoClOrdId is required.If both are passed, algoId will be used.
algoClOrdId	String	Conditional	Client-supplied Algo ID
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
Response Example

{
    "code": "0",
    "data": [
        {
            "activePx": "",
            "actualPx": "",
            "actualSide": "",
            "actualSz": "0",
            "algoClOrdId": "",
            "algoId": "1753184812254216192",
            "amendPxOnTriggerType": "0",
            "attachAlgoOrds": [],
            "cTime": "1724751378980",
            "callbackRatio": "",
            "callbackSpread": "",
            "ccy": "",
            "chaseType": "",
            "chaseVal": "",
            "clOrdId": "",
            "closeFraction": "",
            "failCode": "0",
            "instId": "BTC-USDT",
            "instType": "SPOT",
            "isTradeBorrowMode": "",
            "last": "62916.5",
            "lever": "",
            "linkedOrd": {
                "ordId": ""
            },
            "maxChaseType": "",
            "maxChaseVal": "",
            "moveTriggerPx": "",
            "ordId": "",
            "ordIdList": [],
            "ordPx": "",
            "ordType": "conditional",
            "posSide": "net",
            "pxLimit": "",
            "pxSpread": "",
            "pxVar": "",
            "quickMgnType": "",
            "reduceOnly": "false",
            "side": "buy",
            "slOrdPx": "",
            "slTriggerPx": "",
            "slTriggerPxType": "",
            "state": "live",
            "sz": "10",
            "szLimit": "",
            "tag": "",
            "tdMode": "cash",
            "tgtCcy": "quote_ccy",
            "timeInterval": "",
            "tpOrdPx": "-1",
            "tpTriggerPx": "10000",
            "tpTriggerPxType": "last",
            "triggerPx": "",
            "triggerPxType": "",
            "triggerTime": "",
            "tradeQuoteCcy": "USDT",
            "uTime": "1724751378980"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID
ccy	String	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode, FUTURES and SWAP contracts.
ordId	String	Latest order ID. It will be deprecated soon
ordIdList	Array of strings	Order ID list. There will be multiple order IDs when there is TP/SL splitting order.
algoId	String	Algo ID
clOrdId	String	Client Order ID as assigned by the client
sz	String	Quantity to buy or sell
closeFraction	String	Fraction of position to be closed when the algo order is triggered
ordType	String	Order type
side	String	Order side
posSide	String	Position side
tdMode	String	Trade mode
tgtCcy	String	Order quantity unit setting for sz
base_ccy: Base currency ,quote_ccy: Quote currency
Only applicable to SPOT Market Orders
Default is quote_ccy for buy, base_ccy for sell
state	String	State
live
pause
partially_effective
effective
canceled
order_failed
partially_failed
lever	String	Leverage, from 0.01 to 125.
Only applicable to MARGIN/FUTURES/SWAP
tpTriggerPx	String	Take-profit trigger price.
tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
tpOrdPx	String	Take-profit order price.
slTriggerPx	String	Stop-loss trigger price.
slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
slOrdPx	String	Stop-loss order price.
triggerPx	String	trigger price.
triggerPxType	String	trigger price type.
last: last price
index: index price
mark: mark price
ordPx	String	Order price for the trigger order
advanceOrdType	String	Trigger order type
fok: Fill-or-kill order
ioc: Immediate-or-cancel order
Default is "", limit or market (controlled by orderPx)
actualSz	String	Actual order quantity
actualPx	String	Actual order price
tag	String	Order tag
actualSide	String	Actual trigger side, tp: take profit sl: stop loss
Only applicable to oco order and conditional order
triggerTime	String	Trigger time, Unix timestamp format in milliseconds, e.g. 1597026383085
pxVar	String	Price ratio
Only applicable to iceberg order or twap order
pxSpread	String	Price variance
Only applicable to iceberg order or twap order
szLimit	String	Average amount
Only applicable to iceberg order or twap order
pxLimit	String	Price Limit
Only applicable to iceberg order or twap order
timeInterval	String	Time interval
Only applicable to twap order
callbackRatio	String	Callback price ratio
Only applicable to move_order_stop order
callbackSpread	String	Callback price variance
Only applicable to move_order_stop order
activePx	String	Active price
Only applicable to move_order_stop order
moveTriggerPx	String	Trigger price
Only applicable to move_order_stop order
reduceOnly	String	Whether the order can only reduce the position size. Valid options: true or false.
quickMgnType	String	Quick Margin type, Only applicable to Quick Margin Mode of isolated margin
manual, auto_borrow, auto_repay (Deprecated)
last	String	Last filled price while placing
failCode	String	It represents that the reason that algo order fails to trigger. It is "" when the state is effective/canceled. There will be value when the state is order_failed, e.g. 51008;
Only applicable to Stop Order, Trailing Stop Order, Trigger order.
algoClOrdId	String	Client-supplied Algo ID
amendPxOnTriggerType	String	Whether to enable Cost-price SL. Only applicable to SL order of split TPs.
0: disable, the default value
1: Enable
attachAlgoOrds	Array of objects	Attached TP/SL or trailing stop order info
Applicable to Futures mode/Multi-currency margin/Portfolio margin
> attachAlgoClOrdId	String	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
It will be posted to algoClOrdId when placing the attached algo order once the general order is filled completely.
> tpTriggerPx	String	Take-profit trigger price
If you fill in this parameter, you should fill in the take-profit order price as well.
> tpTriggerRatio	String	Take profit trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
> tpTriggerPxType	String	Take-profit trigger price type
last: last price
index: index price
mark: mark price
> tpOrdPx	String	Take-profit order price
If you fill in this parameter, you should fill in the take-profit trigger price as well.
If the price is -1, take-profit will be executed at the market price.
> slTriggerPx	String	Stop-loss trigger price
If you fill in this parameter, you should fill in the stop-loss order price.
> slTriggerRatio	String	Stop-loss trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
> slTriggerPxType	String	Stop-loss trigger price type
last: last price
index: index price
mark: mark price
> slOrdPx	String	Stop-loss order price
If you fill in this parameter, you should fill in the stop-loss trigger price.
If the price is -1, stop-loss will be executed at the market price.
> callbackRatio	String	Callback ratio, e.g. 0.05 represents 5%
> callbackSpread	String	Callback spread (price distance)
> activePx	String	Activation price
linkedOrd	Object	Linked TP order detail, only applicable to SL order that comes from the one-cancels-the-other (OCO) order that contains the TP limit order.
> ordId	String	Order ID
cTime	String	Creation time Unix timestamp format in milliseconds, e.g. 1597026383085
uTime	String	Order updated time, Unix timestamp format in milliseconds, e.g. 1597026383085
isTradeBorrowMode	String	Whether borrowing currency automatically
true
false
Only applicable to trigger order, trailing order and twap order
chaseType	String	Chase type. Only applicable to chase order.
chaseVal	String	Chase value. Only applicable to chase order.
maxChaseType	String	Maximum chase type. Only applicable to chase order.
maxChaseVal	String	Maximum chase value. Only applicable to chase order.
tradeQuoteCcy	String	The quote currency used for trading.
GET / Algo order list
Retrieve a list of untriggered Algo orders under the current account.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/trade/orders-algo-pending

Request Example

GET /api/v5/trade/orders-algo-pending?ordType=conditional

Request Parameters
Parameter	Type	Required	Description
ordType	String	Yes	Order type
conditional: One-way stop order
oco: One-cancels-the-other order
chase: chase order, only applicable to FUTURES and SWAP
trigger: Trigger order
move_order_stop: Trailing order
iceberg: Iceberg order
twap: TWAP order
smart_iceberg: Iceberg order
For every request, unlike other ordType which only can use one type, conditional and oco both can be used and separated with comma.
algoId	String	No	Algo ID
instType	String	No	Instrument type
SPOT
SWAP
FUTURES
MARGIN
instId	String	No	Instrument ID, e.g. BTC-USDT
after	String	No	Pagination of data to return records earlier than the requested algoId.
before	String	No	Pagination of data to return records newer than the requested algoId.
limit	String	No	Number of results per request. The maximum is 100. The default is 100
Response Example

{
    "code": "0",
    "data": [
        {
            "activePx": "",
            "actualPx": "",
            "actualSide": "",
            "actualSz": "0",
            "algoClOrdId": "",
            "algoId": "1753184812254216192",
            "amendPxOnTriggerType": "0",
            "attachAlgoOrds": [],
            "cTime": "1724751378980",
            "callbackRatio": "",
            "callbackSpread": "",
            "ccy": "",
            "chaseType": "",
            "chaseVal": "",
            "clOrdId": "",
            "closeFraction": "",
            "failCode": "0",
            "instId": "BTC-USDT",
            "instType": "SPOT",
            "isTradeBorrowMode": "",
            "last": "62916.5",
            "lever": "",
            "linkedOrd": {
                "ordId": ""
            },
            "maxChaseType": "",
            "maxChaseVal": "",
            "moveTriggerPx": "",
            "ordId": "",
            "ordIdList": [],
            "ordPx": "",
            "ordType": "conditional",
            "posSide": "net",
            "pxLimit": "",
            "pxSpread": "",
            "pxVar": "",
            "quickMgnType": "",
            "reduceOnly": "false",
            "side": "buy",
            "slOrdPx": "",
            "slTriggerPx": "",
            "slTriggerPxType": "",
            "state": "live",
            "sz": "10",
            "szLimit": "",
            "tag": "",
            "tdMode": "cash",
            "tgtCcy": "quote_ccy",
            "timeInterval": "",
            "tpOrdPx": "-1",
            "tpTriggerPx": "10000",
            "tpTriggerPxType": "last",
            "triggerPx": "",
            "triggerPxType": "",
            "triggerTime": "",
            "tradeQuoteCcy": "USDT",
            "uTime": "1724751378980"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID
ccy	String	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode, FUTURES and SWAP contracts.
ordId	String	Latest order ID. It will be deprecated soon
ordIdList	Array of strings	Order ID list. There will be multiple order IDs when there is TP/SL splitting order.
algoId	String	Algo ID
clOrdId	String	Client Order ID as assigned by the client
sz	String	Quantity to buy or sell
closeFraction	String	Fraction of position to be closed when the algo order is triggered
ordType	String	Order type
side	String	Order side
posSide	String	Position side
tdMode	String	Trade mode
tgtCcy	String	Order quantity unit setting for sz
base_ccy: Base currency ,quote_ccy: Quote currency
Only applicable to SPOT traded with Market order
state	String	State
live
pause
lever	String	Leverage, from 0.01 to 125.
Only applicable to MARGIN/FUTURES/SWAP
tpTriggerPx	String	Take-profit trigger price
tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
tpOrdPx	String	Take-profit order price
slTriggerPx	String	Stop-loss trigger price
slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
slOrdPx	String	Stop-loss order price
triggerPx	String	Trigger price
triggerPxType	String	Trigger price type.
last: last price
index: index price
mark: mark price
ordPx	String	Order price for the trigger order
advanceOrdType	String	Trigger order type
actualSz	String	Actual order quantity
tag	String	Order tag
actualPx	String	Actual order price
actualSide	String	Actual trigger side
tp: take profit sl: stop loss
Only applicable to oco order and conditional order
triggerTime	String	Trigger time, Unix timestamp format in milliseconds, e.g. 1597026383085
pxVar	String	Price ratio
Only applicable to iceberg order or twap order
pxSpread	String	Price variance
Only applicable to iceberg order or twap order
szLimit	String	Average amount
Only applicable to iceberg order or twap order
pxLimit	String	Price Limit
Only applicable to iceberg order or twap order
lmtOrderNumber	String	Number of limit order splits
Only applicable to smart_iceberg
aggressiveness	String	Aggressiveness level
1: Faster fill
2: Faster fill with better price
3: Queue at best bid/ask
Only applicable to smart_iceberg
triggerParams	Array of objects	Trigger parameters
Only applicable to smart_iceberg
> triggerAction	String	Trigger action
start: Start iceberg order
> triggerStrategy	String	Trigger strategy
instant: Trigger immediately
price: Trigger by price
rsi: Trigger by RSI indicator
> triggerPx	String	Trigger price
Only valid when triggerStrategy is price
> triggerCond	String	Trigger condition
cross_up / cross_down / above / below / cross
Only valid when triggerStrategy is rsi
> timeframe	String	K-line type: 3m / 5m / 15m / 30m (m = minute)
1H / 4H (H = hour)
1D (D = day)
Only valid when triggerStrategy is rsi
> thold	String	Threshold, integer in range [1, 100]
Only valid when triggerStrategy is rsi
> timePeriod	String	RSI calculation period. Default and fixed value is 14
Only valid when triggerStrategy is rsi
timeInterval	String	Time interval
Only applicable to twap order
callbackRatio	String	Callback price ratio
Only applicable to move_order_stop order
callbackSpread	String	Callback price variance
Only applicable to move_order_stop order
activePx	String	Active price
Only applicable to move_order_stop order
moveTriggerPx	String	Trigger price
Only applicable to move_order_stop order
reduceOnly	String	Whether the order can only reduce the position size. Valid options: true or false.
quickMgnType	String	Quick Margin type, Only applicable to Quick Margin Mode of isolated margin
manual, auto_borrow, auto_repay (Deprecated)
last	String	Last filled price while placing
failCode	String	It represents that the reason that algo order fails to trigger. There will be value when the state is order_failed, e.g. 51008;
For this endpoint, it always is "".
algoClOrdId	String	Client-supplied Algo ID
amendPxOnTriggerType	String	Whether to enable Cost-price SL. Only applicable to SL order of split TPs.
0: disable, the default value
1: Enable
attachAlgoOrds	Array of objects	Attached TP/SL or trailing stop order info
Applicable to Futures mode/Multi-currency margin/Portfolio margin
> attachAlgoClOrdId	String	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
It will be posted to algoClOrdId when placing the attached algo order once the general order is filled completely.
> tpTriggerPx	String	Take-profit trigger price
If you fill in this parameter, you should fill in the take-profit order price as well.
> tpTriggerRatio	String	Take profit trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
> tpTriggerPxType	String	Take-profit trigger price type
last: last price
index: index price
mark: mark price
> tpOrdPx	String	Take-profit order price
If you fill in this parameter, you should fill in the take-profit trigger price as well.
If the price is -1, take-profit will be executed at the market price.
> slTriggerPx	String	Stop-loss trigger price
If you fill in this parameter, you should fill in the stop-loss order price.
> slTriggerRatio	String	Stop-loss trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
> slTriggerPxType	String	Stop-loss trigger price type
last: last price
index: index price
mark: mark price
> slOrdPx	String	Stop-loss order price
If you fill in this parameter, you should fill in the stop-loss trigger price.
If the price is -1, stop-loss will be executed at the market price.
> callbackRatio	String	Callback ratio, e.g. 0.05 represents 5%
> callbackSpread	String	Callback spread (price distance)
> activePx	String	Activation price
linkedOrd	Object	Linked TP order detail, only applicable to SL order that comes from the one-cancels-the-other (OCO) order that contains the TP limit order.
> ordId	String	Order ID
cTime	String	Creation time Unix timestamp format in milliseconds, e.g. 1597026383085
uTime	String	Order updated time, Unix timestamp format in milliseconds, e.g. 1597026383085
isTradeBorrowMode	String	Whether borrowing currency automatically
true
false
Only applicable to trigger order, trailing order and twap order
chaseType	String	Chase type. Only applicable to chase order.
chaseVal	String	Chase value. Only applicable to chase order.
maxChaseType	String	Maximum chase type. Only applicable to chase order.
maxChaseVal	String	Maximum chase value. Only applicable to chase order.
tradeQuoteCcy	String	The quote currency used for trading.
GET / Algo order history
Retrieve a list of all algo orders under the current account in the last 3 months.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: User ID
Permission: Read
HTTP Request
GET /api/v5/trade/orders-algo-history

Request Example

GET /api/v5/trade/orders-algo-history?ordType=conditional&state=effective
Request Parameters
Parameter	Type	Required	Description
ordType	String	Yes	Order type
conditional: One-way stop order
oco: One-cancels-the-other order
chase: chase order, only applicable to FUTURES and SWAP
trigger: Trigger order
move_order_stop: Trailing order
iceberg: Iceberg order
twap: TWAP order
smart_iceberg: Iceberg order
For every request, unlike other ordType which only can use one type, conditional and oco both can be used and separated with comma.
state	String	Conditional	State
effective
canceled
order_failed
Either state or algoId is required
algoId	String	Conditional	Algo ID
Either state or algoId is required.
instType	String	No	Instrument type
SPOT
SWAP
FUTURES
MARGIN
instId	String	No	Instrument ID, e.g. BTC-USDT
after	String	No	Pagination of data to return records earlier than the requested algoId
before	String	No	Pagination of data to return records new than the requested algoId
limit	String	No	Number of results per request. The maximum is 100. The default is 100
Response Example

{
    "code": "0",
    "data": [
        {
            "activePx": "",
            "actualPx": "",
            "actualSide": "tp",
            "actualSz": "100",
            "algoClOrdId": "",
            "algoId": "1880721064716505088",
            "amendPxOnTriggerType": "0",
            "attachAlgoOrds": [],
            "cTime": "1728552255493",
            "callbackRatio": "",
            "callbackSpread": "",
            "ccy": "",
            "chaseType": "",
            "chaseVal": "",
            "clOrdId": "",
            "closeFraction": "1",
            "failCode": "1",
            "instId": "BTC-USDT-SWAP",
            "instType": "SWAP",
            "isTradeBorrowMode": "",
            "last": "60777.5",
            "lever": "10",
            "linkedOrd": {
                "ordId": ""
            },
            "maxChaseType": "",
            "maxChaseVal": "",
            "moveTriggerPx": "",
            "ordId": "1884789786215137280",
            "ordIdList": [
                "1884789786215137280"
            ],
            "ordPx": "",
            "ordType": "oco",
            "posSide": "long",
            "pxLimit": "",
            "pxSpread": "",
            "pxVar": "",
            "quickMgnType": "",
            "reduceOnly": "true",
            "side": "sell",
            "slOrdPx": "-1",
            "slTriggerPx": "57000",
            "slTriggerPxType": "mark",
            "state": "effective",
            "sz": "100",
            "szLimit": "",
            "tag": "",
            "tdMode": "isolated",
            "tgtCcy": "",
            "timeInterval": "",
            "tpOrdPx": "-1",
            "tpTriggerPx": "63000",
            "tpTriggerPxType": "last",
            "triggerPx": "",
            "triggerPxType": "",
            "triggerTime": "1728673513447",
            "tradeQuoteCcy": "USDT",
            "uTime": "1728673513447"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID
ccy	String	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode, FUTURES and SWAP contracts.
ordId	String	Latest order ID. It will be deprecated soon
ordIdList	Array of strings	Order ID list. There will be multiple order IDs when there is TP/SL splitting order.
algoId	String	Algo ID
clOrdId	String	Client Order ID as assigned by the client
sz	String	Quantity to buy or sell
closeFraction	String	Fraction of position to be closed when the algo order is triggered
ordType	String	Order type
side	String	Order side
posSide	String	Position side
tdMode	String	Trade mode
tgtCcy	String	Order quantity unit setting for sz
base_ccy: Base currency ,quote_ccy: Quote currency
Only applicable to SPOT Market Orders
Default is quote_ccy for buy, base_ccy for sell
state	String	State
effective
canceled
order_failed
partially_failed
lever	String	Leverage, from 0.01 to 125.
Only applicable to MARGIN/FUTURES/SWAP
tpTriggerPx	String	Take-profit trigger price.
tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
tpOrdPx	String	Take-profit order price.
slTriggerPx	String	Stop-loss trigger price.
slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
slOrdPx	String	Stop-loss order price.
triggerPx	String	trigger price.
triggerPxType	String	trigger price type.
last: last price
index: index price
mark: mark price
ordPx	String	Order price for the trigger order
advanceOrdType	String	Trigger order type
actualSz	String	Actual order quantity
actualPx	String	Actual order price
tag	String	Order tag
actualSide	String	Actual trigger side, tp: take profit sl: stop loss
Only applicable to oco order and conditional order
triggerTime	String	Trigger time, Unix timestamp format in milliseconds, e.g. 1597026383085
pxVar	String	Price ratio
Only applicable to iceberg order or twap order
pxSpread	String	Price variance
Only applicable to iceberg order or twap order
szLimit	String	Average amount
Only applicable to iceberg order or twap order
pxLimit	String	Price Limit
Only applicable to iceberg order or twap order
lmtOrderNumber	String	Number of limit order splits
Only applicable to smart_iceberg
aggressiveness	String	Aggressiveness level
1: Faster fill
2: Faster fill with better price
3: Queue at best bid/ask
Only applicable to smart_iceberg
triggerParams	Array of objects	Trigger parameters
Only applicable to smart_iceberg
> triggerAction	String	Trigger action
start: Start iceberg order
> triggerStrategy	String	Trigger strategy
instant: Trigger immediately
price: Trigger by price
rsi: Trigger by RSI indicator
> triggerPx	String	Trigger price
Only valid when triggerStrategy is price
> triggerCond	String	Trigger condition
cross_up / cross_down / above / below / cross
Only valid when triggerStrategy is rsi
> timeframe	String	K-line type: 3m / 5m / 15m / 30m (m = minute)
1H / 4H (H = hour)
1D (D = day)
Only valid when triggerStrategy is rsi
> thold	String	Threshold, integer in range [1, 100]
Only valid when triggerStrategy is rsi
> timePeriod	String	RSI calculation period. Default and fixed value is 14
Only valid when triggerStrategy is rsi
timeInterval	String	Time interval
Only applicable to twap order
callbackRatio	String	Callback price ratio
Only applicable to move_order_stop order
callbackSpread	String	Callback price variance
Only applicable to move_order_stop order
activePx	String	Active price
Only applicable to move_order_stop order
moveTriggerPx	String	Trigger price
Only applicable to move_order_stop order
reduceOnly	String	Whether the order can only reduce the position size. Valid options: true or false.
quickMgnType	String	Quick Margin type, Only applicable to Quick Margin Mode of isolated margin
manual, auto_borrow, auto_repay (Deprecated)
last	String	Last filled price while placing
failCode	String	It represents that the reason that algo order fails to trigger. It is "" when the state is effective/canceled. There will be value when the state is order_failed, e.g. 51008;
Only applicable to Stop Order, Trailing Stop Order, Trigger order.
algoClOrdId	String	Client Algo Order ID as assigned by the client.
amendPxOnTriggerType	String	Whether to enable Cost-price SL. Only applicable to SL order of split TPs.
0: disable, the default value
1: Enable
attachAlgoOrds	Array of objects	Attached TP/SL or trailing stop order info
Applicable to Futures mode/Multi-currency margin/Portfolio margin
> attachAlgoClOrdId	String	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
It will be posted to algoClOrdId when placing the attached algo order once the general order is filled completely.
> tpTriggerPx	String	Take-profit trigger price
If you fill in this parameter, you should fill in the take-profit order price as well.
> tpTriggerRatio	String	Take profit trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
> tpTriggerPxType	String	Take-profit trigger price type
last: last price
index: index price
mark: mark price
> tpOrdPx	String	Take-profit order price
If you fill in this parameter, you should fill in the take-profit trigger price as well.
If the price is -1, take-profit will be executed at the market price.
> slTriggerPx	String	Stop-loss trigger price
If you fill in this parameter, you should fill in the stop-loss order price.
> slTriggerRatio	String	Stop-loss trigger ratio, 0.3 represents 30%
Only applicable to FUTURES and SWAP.
> slTriggerPxType	String	Stop-loss trigger price type
last: last price
index: index price
mark: mark price
> slOrdPx	String	Stop-loss order price
If you fill in this parameter, you should fill in the stop-loss trigger price.
If the price is -1, stop-loss will be executed at the market price.
> callbackRatio	String	Callback ratio, e.g. 0.05 represents 5%
> callbackSpread	String	Callback spread (price distance)
> activePx	String	Activation price
linkedOrd	Object	Linked TP order detail, only applicable to SL order that comes from the one-cancels-the-other (OCO) order that contains the TP limit order.
> ordId	String	Order ID
cTime	String	Creation time Unix timestamp format in milliseconds, e.g. 1597026383085
uTime	String	Order updated time, Unix timestamp format in milliseconds, e.g. 1597026383085
isTradeBorrowMode	String	Whether borrowing currency automatically
true
false
Only applicable to trigger order, trailing order and twap order
chaseType	String	Chase type. Only applicable to chase order.
chaseVal	String	Chase value. Only applicable to chase order.
maxChaseType	String	Maximum chase type. Only applicable to chase order.
maxChaseVal	String	Maximum chase value. Only applicable to chase order.
tradeQuoteCcy	String	The quote currency used for trading.
WS / Algo orders channel
Retrieve algo orders (includes trigger order, oco order, conditional order). Data will not be pushed when first subscribed. Data will only be pushed when there are order updates.

URL Path
/ws/v5/business (required login)

Request Example : single

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "orders-algo",
      "instType": "FUTURES",
      "instFamily": "BTC-USD",
      "instId": "BTC-USD-200329"
    }
  ]
}
Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "orders-algo",
      "instType": "FUTURES",
      "instFamily": "BTC-USD"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
orders-algo
> instType	String	Yes	Instrument type
SPOT
MARGIN
SWAP
FUTURES
ANY
> instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
> instId	String	No	Instrument ID
Successful Response Example : single

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "orders-algo",
    "instType": "FUTURES",
    "instFamily": "BTC-USD",
    "instId": "BTC-USD-200329"
  },
  "connId": "a4d3ae55"
}
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "orders-algo",
    "instType": "FUTURES",
    "instFamily": "BTC-USD"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"orders-algo\", \"instType\" : \"FUTURES\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instType	String	Yes	Instrument type
SPOT
MARGIN
SWAP
FUTURES
ANY
> instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
> instId	String	No	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example: single

{
    "arg": {
        "channel": "orders-algo",
        "uid": "77982378738415879",
        "instType": "FUTURES",
        "instId": "BTC-USD-200329"
    },
    "data": [{
        "actualPx": "0",
        "actualSide": "",
        "actualSz": "0",
        "algoClOrdId": "",
        "algoId": "581878926302093312",
        "attachAlgoOrds": [],
        "amendResult": "",
        "cTime": "1685002746818",
        "uTime": "1708679675245",
        "ccy": "",
        "clOrdId": "",
        "closeFraction": "",
        "failCode": "",
        "instId": "BTC-USDC",
        "instType": "SPOT",
        "last": "26174.8",
        "lever": "0",
        "notionalUsd": "11.0",
        "ordId": "",
        "ordIdList": [],
        "ordPx": "",
        "ordType": "conditional",
        "posSide": "",
        "quickMgnType": "",
        "reduceOnly": "false",
        "reqId": "",
        "side": "buy",
        "slOrdPx": "",
        "slTriggerPx": "",
        "slTriggerPxType": "",
        "state": "live",
        "sz": "11",
        "tag": "",
        "tdMode": "cross",
        "tgtCcy": "quote_ccy",
        "tpOrdPx": "-1",
        "tpTriggerPx": "1",
        "tpTriggerPxType": "last",
        "triggerPx": "",
        "triggerTime": "",
        "tradeQuoteCcy": "USDT",
        "amendPxOnTriggerType": "0",
        "linkedOrd":{
                "ordId":"98192973880283"
        },
        "isTradeBorrowMode": ""
    }]
}
Response parameters when data is pushed.
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> uid	String	User Identifier
> instType	String	Instrument type
> instFamily	String	Instrument family
> instId	String	Instrument ID
data	Array of objects	Subscribed data
> instType	String	Instrument type
> instId	String	Instrument ID
> ccy	String	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode, FUTURES and SWAP contracts.
> ordId	String	Latest order ID, the order ID associated with the algo order. It will be deprecated soon
> ordIdList	Array of strings	Order ID list. There will be multiple order IDs when there is TP/SL splitting order.
> algoId	String	Algo ID
> clOrdId	String	Client Order ID as assigned by the client
> sz	String	Quantity to buy or sell.
SPOT/MARGIN: in the unit of currency.
FUTURES/SWAP/OPTION: in the unit of contract.
> ordType	String	Order type
conditional: One-way stop order
oco: One-cancels-the-other order
trigger: Trigger order
chase: Chase order
> side	String	Order side
buy
sell
> posSide	String	Position side
net
long or short
Only applicable to FUTURES/SWAP
> tdMode	String	Trade mode
cross: cross
isolated: isolated
cash: cash
> tgtCcy	String	Order quantity unit setting for sz
base_ccy: Base currency
quote_ccy: Quote currency
Only applicable to SPOT Market Orders
Default is quote_ccy for buy, base_ccy for sell
> lever	String	Leverage, from 0.01 to 125.
Only applicable to MARGIN/FUTURES/SWAP
> state	String	Order status
live: to be effective
effective: effective
canceled: canceled
order_failed: order failed
partially_failed: partially failed
partially_effective: partially effective
> tpTriggerPx	String	Take-profit trigger price.
> tpTriggerPxType	String	Take-profit trigger price type.
last: last price
index: index price
mark: mark price
> tpOrdPx	String	Take-profit order price.
> slTriggerPx	String	Stop-loss trigger price.
> slTriggerPxType	String	Stop-loss trigger price type.
last: last price
index: index price
mark: mark price
> slOrdPx	String	Stop-loss order price.
> triggerPx	String	Trigger price
> triggerPxType	String	Trigger price type.
last: last price
index: index price
mark: mark price
> ordPx	String	Order price for the trigger order
> advanceOrdType	String	Trigger order type
> last	String	Last filled price while placing
> actualSz	String	Actual order quantity
> actualPx	String	Actual order price
> notionalUsd	String	Estimated national value in USD of order
> tag	String	Order tag
> actualSide	String	Actual trigger side
Only applicable to oco order and conditional order
> triggerTime	String	Trigger time, Unix timestamp format in milliseconds, e.g. 1597026383085
> reduceOnly	String	Whether the order can only reduce the position size. Valid options: true or false.
> failCode	String	It represents that the reason that algo order fails to trigger. It is "" when the state is effective/canceled. There will be value when the state is order_failed, e.g. 51008;
Only applicable to Stop Order, Trailing Stop Order, Trigger order.
> algoClOrdId	String	Client Algo Order ID as assigned by the client.
> reqId	String	Client Request ID as assigned by the client for order amendment. "" will be returned if there is no order amendment.
> amendResult	String	The result of amending the order
-1: failure
0: success
> amendPxOnTriggerType	String	Whether to enable Cost-price SL. Only applicable to SL order of split TPs.
0: disable, the default value
1: Enable
> attachAlgoOrds	Array of objects	Attached TP/SL or trailing stop order info
Applicable to Futures mode/Multi-currency margin/Portfolio margin
>> attachAlgoClOrdId	String	Client-supplied Algo ID when placing order with attached TP/SL or trailing stop.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
It will be posted to algoClOrdId when placing the attached algo order once the general order is filled completely.
>> tpTriggerPx	String	Take-profit trigger price
If you fill in this parameter, you should fill in the take-profit order price as well.
>> tpTriggerRatio	String	Take-profit trigger ratio, 0.3 represents 30%. Only applicable to FUTURES/SWAP contracts.
>> tpTriggerPxType	String	Take-profit trigger price type
last: last price
index: index price
mark: mark price
>> tpOrdPx	String	Take-profit order price
If you fill in this parameter, you should fill in the take-profit trigger price as well.
If the price is -1, take-profit will be executed at the market price.
>> slTriggerPx	String	Stop-loss trigger price
If you fill in this parameter, you should fill in the stop-loss order price.
>> slTriggerRatio	String	Stop-loss trigger ratio, 0.3 represents 30%. Only applicable to FUTURES/SWAP contracts.
>> slTriggerPxType	String	Stop-loss trigger price type
last: last price
index: index price
mark: mark price
>> slOrdPx	String	Stop-loss order price
If you fill in this parameter, you should fill in the stop-loss trigger price.
If the price is -1, stop-loss will be executed at the market price.
>> callbackRatio	String	Callback ratio, e.g. 0.05 represents 5%
>> callbackSpread	String	Callback spread (price distance)
>> activePx	String	Activation price
> linkedOrd	Object	Linked TP order detail, only applicable to SL order that comes from the one-cancels-the-other (OCO) order that contains the TP limit order.
>> ordId	String	Order ID
> cTime	String	Creation time Unix timestamp format in milliseconds, e.g. 1597026383085
> uTime	String	Order updated time, Unix timestamp format in milliseconds, e.g. 1597026383085
> isTradeBorrowMode	String	Whether borrowing currency automatically
true
false
Only applicable to trigger order, trailing order and twap order
> chaseType	String	Chase type. Only applicable to chase order.
> chaseVal	String	Chase value. Only applicable to chase order.
> maxChaseType	String	Maximum chase type. Only applicable to chase order.
> maxChaseVal	String	Maximum chase value. Only applicable to chase order.
> tradeQuoteCcy	String	The quote currency used for trading.
WS / Advance algo orders channel
Retrieve advance algo orders (including Iceberg order, TWAP order, Trailing order). Data will be pushed when first subscribed. Data will be pushed when triggered by events such as placing/canceling order.

URL Path
/ws/v5/business (required login)

Request Example : single

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "algo-advance",
      "instType": "SPOT",
      "instId": "BTC-USDT"
    }
  ]
}
Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "algo-advance",
      "instType": "SPOT"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
algo-advance
> instType	String	Yes	Instrument type
SPOT
MARGIN
SWAP
FUTURES
ANY
> instId	String	No	Instrument ID
> algoId	String	No	Algo Order ID
Successful Response Example : single

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "algo-advance",
    "instType": "SPOT",
    "instId": "BTC-USDT"
  },
  "connId": "a4d3ae55"
}
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "algo-advance",
    "instType": "SPOT"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"algo-advance\", \"instType\" : \"FUTURES\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instType	String	Yes	Instrument type
SPOT
MARGIN
SWAP
FUTURES
ANY
> instId	String	No	Instrument ID
> algoId	String	No	Algo Order ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example: single

{
    "arg":{
        "channel":"algo-advance",
        "uid": "77982378738415879",
        "instType":"SPOT",
        "instId":"BTC-USDT"
    },
    "data":[
        {
            "actualPx":"",
            "actualSide":"",
            "actualSz":"0",
            "algoId":"355056228680335360",
            "cTime":"1630924001545",
            "ccy":"",
            "clOrdId": "",
            "count":"1",
            "instId":"BTC-USDT",
            "instType":"SPOT",
            "lever":"0",
            "notionalUsd":"",
            "ordPx":"",
            "ordType":"iceberg",
            "pTime":"1630924295204",
            "posSide":"net",
            "pxLimit":"10",
            "pxSpread":"1",
            "pxVar":"",
            "side":"buy",
            "slOrdPx":"",
            "slTriggerPx":"",
            "state":"pause",
            "sz":"0.1",
            "szLimit":"0.1",
            "tdMode":"cash",
            "timeInterval":"",
            "tpOrdPx":"",
            "tpTriggerPx":"",
            "tag": "adadadadad",
            "triggerPx":"",
            "triggerTime":"",
            "tradeQuoteCcy": "USDT",
            "callbackRatio":"",
            "callbackSpread":"",
            "activePx":"",
            "moveTriggerPx":"",
            "failCode": "",
                "algoClOrdId": "",
            "reduceOnly": "",
            "isTradeBorrowMode": true
        }
    ]
}
Response parameters when data is pushed.
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> uid	String	User Identifier
> instType	String	Instrument type
> instId	String	Instrument ID
> algoId	String	Algo Order ID
data	Array of objects	Subscribed data
> instType	String	Instrument type
> instId	String	Instrument ID
> ccy	String	Margin currency
Applicable to all isolated MARGIN orders and cross MARGIN orders in Futures mode, FUTURES and SWAP contracts.
> ordId	String	Order ID, the order ID associated with the algo order.
> algoId	String	Algo ID
> clOrdId	String	Client Order ID as assigned by the client
> sz	String	Quantity to buy or sell. SPOT/MARGIN: in the unit of currency. FUTURES/SWAP/OPTION: in the unit of contract.
> side	String	Order side, buy sell
> posSide	String	Position side
net
long or short Only applicable to FUTURES/SWAP
> tdMode	String	Trade mode, cross: cross isolated: isolated cash: cash
> tgtCcy	String	Order quantity unit setting for sz
base_ccy: Base currency ,quote_ccy: Quote currency
Only applicable to SPOT Market Orders
Default is quote_ccy for buy, base_ccy for sell
> lever	String	Leverage, from 0.01 to 125.
Only applicable to MARGIN/FUTURES/SWAP
> state	String	Order status
live: to be effective
effective: effective
partially_effective: partially effective
canceled: canceled
order_failed: order failed
pause: pause
> tpTriggerPx	String	Take-profit trigger price.
> tpOrdPx	String	Take-profit order price.
> slTriggerPx	String	Stop-loss trigger price.
> slOrdPx	String	Stop-loss order price.
> triggerPx	String	Trigger price
> ordPx	String	Order price
> actualSz	String	Actual order quantity
> actualPx	String	Actual order price
> notionalUsd	String	Estimated national value in USD of order
> tag	String	Order tag
> actualSide	String	Actual trigger side
> triggerTime	String	Trigger time, Unix timestamp format in milliseconds, e.g. 1597026383085
> cTime	String	Creation time, Unix timestamp format in milliseconds, e.g. 1597026383085
> pxVar	String	Price ratio
Only applicable to iceberg order or twap order
> pxSpread	String	Price variance
Only applicable to iceberg order or twap order
> szLimit	String	Average amount
Only applicable to iceberg order or twap order
> pxLimit	String	Price limit
Only applicable to iceberg order or twap order
> timeInterval	String	Time interval
Only applicable to twap order
> count	String	Algo Order count
Only applicable to iceberg order or twap order
> callbackRatio	String	Callback price ratio
Only applicable to move_order_stop order
> callbackSpread	String	Callback price variance
Only applicable to move_order_stop order
> activePx	String	Active price
Only applicable to move_order_stop order
> moveTriggerPx	String	Trigger price
Only applicable to move_order_stop order
> failCode	String	It represents that the reason that algo order fails to trigger. It is "" when the state is effective/canceled. There will be value when the state is order_failed, e.g. 51008;
Only applicable to Stop Order, Trailing Stop Order, Trigger order.
> algoClOrdId	String	Client Algo Order ID as assigned by the client.
> reduceOnly	String	Whether the order can only reduce the position size. Valid options: true or false.
> pTime	String	Push time of algo order information, millisecond format of Unix timestamp, e.g. 1597026383085
> isTradeBorrowMode	Boolean	Whether borrowing currency automatically
true
false
Only applicable to trigger order, trailing order and twap order
> tradeQuoteCcy	String	The quote currency used for trading.
Market Data
The API endpoints of Market Data do not require authentication.
There are multiple services for market data, and each service has an independent cache. A random service will be requested for every request. So for two requests, it’s expected that the data obtained in the second request is earlier than the first request.

GET / Tickers
Retrieve the latest price snapshot, best bid/ask price, and trading volume in the last 24 hours. Best ask price may be lower than the best bid price during the pre-open period.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/market/tickers

Request Example

GET /api/v5/market/tickers?instType=SWAP

Request Parameters
Parameter	Type	Required	Description
instType	String	Yes	Instrument type
SPOT
SWAP
FUTURES
OPTION
instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
     {
        "instType":"SWAP",
        "instId":"LTC-USD-SWAP",
        "last":"9999.99",
        "lastSz":"1",
        "askPx":"9999.99",
        "askSz":"11",
        "bidPx":"8888.88",
        "bidSz":"5",
        "open24h":"9000",
        "high24h":"10000",
        "low24h":"8888.88",
        "volCcy24h":"2222",
        "vol24h":"2222",
        "sodUtc0":"0.1",
        "sodUtc8":"0.1",
        "ts":"1597026383085"
     },
     {
        "instType":"SWAP",
        "instId":"BTC-USD-SWAP",
        "last":"9999.99",
        "lastSz":"1",
        "askPx":"9999.99",
        "askSz":"11",
        "bidPx":"8888.88",
        "bidSz":"5",
        "open24h":"9000",
        "high24h":"10000",
        "low24h":"8888.88",
        "volCcy24h":"2222",
        "vol24h":"2222",
        "sodUtc0":"0.1",
        "sodUtc8":"0.1",
        "ts":"1597026383085"
    }
  ]
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID
last	String	Last traded price
lastSz	String	Last traded size. 0 represents there is no trading volume
askPx	String	Best ask price
askSz	String	Best ask size
bidPx	String	Best bid price
bidSz	String	Best bid size
open24h	String	Open price in the past 24 hours
high24h	String	Highest price in the past 24 hours
low24h	String	Lowest price in the past 24 hours
volCcy24h	String	24h trading volume, with a unit of currency.
If it is a derivatives contract, the value is the number of base currency. e.g. the unit is BTC for BTC-USD-SWAP and BTC-USDT-SWAP
If it is SPOT/MARGIN, the value is the quantity in quote currency.
vol24h	String	24h trading volume, with a unit of contract.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
sodUtc0	String	Open price in the UTC 0
sodUtc8	String	Open price in the UTC 8
ts	String	Ticker data generation time, Unix timestamp format in milliseconds, e.g. 1597026383085
GET / Ticker
Retrieve the latest price snapshot, best bid/ask price, and trading volume in the last 24 hours. Best ask price may be lower than the best bid price during the pre-open period.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/market/ticker

Request Example

GET /api/v5/market/ticker?instId=BTC-USD-SWAP

Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USD-SWAP
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
     {
        "instType":"SWAP",
        "instId":"BTC-USD-SWAP",
        "last":"9999.99",
        "lastSz":"0.1",
        "askPx":"9999.99",
        "askSz":"11",
        "bidPx":"8888.88",
        "bidSz":"5",
        "open24h":"9000",
        "high24h":"10000",
        "low24h":"8888.88",
        "volCcy24h":"2222",
        "vol24h":"2222",
        "sodUtc0":"2222",
        "sodUtc8":"2222",
        "ts":"1597026383085"
    }
  ]
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID
last	String	Last traded price
lastSz	String	Last traded size. 0 represents there is no trading volume
askPx	String	Best ask price
askSz	String	Best ask size
bidPx	String	Best bid price
bidSz	String	Best bid size
open24h	String	Open price in the past 24 hours
high24h	String	Highest price in the past 24 hours
low24h	String	Lowest price in the past 24 hours
volCcy24h	String	24h trading volume, with a unit of currency.
If it is a derivatives contract, the value is the number of base currency.
If it is SPOT/MARGIN, the value is the quantity in quote currency.
vol24h	String	24h trading volume, with a unit of contract.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
sodUtc0	String	Open price in the UTC 0
sodUtc8	String	Open price in the UTC 8
ts	String	Ticker data generation time, Unix timestamp format in milliseconds, e.g. 1597026383085.
GET / Order book
Retrieve order book of the instrument. The data will be updated once every 50 milliseconds. Best ask price may be lower than the best bid price during the pre-open period.
This endpoint does not return data immediately. Instead, it returns the latest data once the server-side cache has been updated.

Rate Limit: 40 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/market/books

Request Example

GET /api/v5/market/books?instId=BTC-USDT

Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USDT
sz	String	No	Order book depth per side. Maximum 400, e.g. 400 bids + 400 asks
Default returns to 1 depth data
Response Example

{
    "code": "0",
    "msg": "",
    "data": [
        {
            "asks": [
                [
                    "41006.8",
                    "0.60038921",
                    "0",
                    "1"
                ]
            ],
            "bids": [
                [
                    "41006.3",
                    "0.30178218",
                    "0",
                    "2"
                ]
            ],
            "ts": "1629966436396",
            "seqId": 3235851742
        }
    ]
}
Response Parameters
Parameter	Type	Description
asks	Array of Arrays	Order book on sell side
bids	Array of Arrays	Order book on buy side
ts	String	Order book generation time
seqId	Integer	Sequence ID of the current message
 An example of the array of asks and bids values: ["411.8", "10", "0", "4"]
- "411.8" is the depth price
- "10" is the quantity at the price (number of contracts for derivatives, quantity in base currency for Spot and Spot Margin)
- "0" is part of a deprecated feature and it is always "0"
- "4" is the number of orders at the price.
 The order book data will be updated around once a second during the call auction.
GET / Full order book
Retrieve order book of the instrument. The data will be updated once a second. Best ask price may be lower than the best bid price during the pre-open period.
This endpoint does not return data immediately. Instead, it returns the latest data once the server-side cache has been updated.

Rate Limit: 10 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/market/books-full

Request Example

GET /api/v5/market/books-full?instId=BTC-USDT&sz=1

Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USDT
sz	String	No	Order book depth per side. Maximum 5000, e.g. 5000 bids + 5000 asks
Default returns to 1 depth data.
Response Example

{
    "code": "0",
    "msg": "",
    "data": [
        {
            "asks": [
                [
                    "41006.8",
                    "0.60038921",
                    "1"
                ]
            ],
            "bids": [
                [
                    "41006.3",
                    "0.30178218",
                    "2"
                ]
            ],
            "ts": "1629966436396"
        }
    ]
}
Response Parameters
Parameter	Type	Description
asks	Array of Arrays	Order book on sell side
bids	Array of Arrays	Order book on buy side
ts	String	Order book generation time
 An example of the array of asks and bids values: ["411.8", "10", "4"]
- "411.8" is the depth price
- "10" is the quantity at the price (number of contracts for derivatives, quantity in base currency for Spot and Spot Margin)
- "4" is the number of orders at the price.
 The order book data will be updated around once a second during the call auction.
GET / Candlesticks
Retrieve the candlestick charts. This endpoint can retrieve the latest 1,440 data entries. Charts are returned in groups based on the requested bar.

Rate Limit: 40 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/market/candles

Request Example

GET /api/v5/market/candles?instId=BTC-USDT
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USDT
bar	String	No	Bar size, the default is 1m
e.g. [1m/3m/5m/15m/30m/1H/2H/4H]
UTC+8 opening price k-line: [6H/12H/1D/2D/3D/1W/1M/3M]
UTC+0 opening price k-line: [6Hutc/12Hutc/1Dutc/2Dutc/3Dutc/1Wutc/1Mutc/3Mutc]
after	String	No	Pagination of data to return records earlier than the requested ts
before	String	No	Pagination of data to return records newer than the requested ts. The latest data will be returned when using before individually
limit	String	No	Number of results per request. The maximum is 300. The default is 100.
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
     [
        "1597026383085",
        "3.721",
        "3.743",
        "3.677",
        "3.708",
        "8422410",
        "22698348.04828491",
        "12698348.04828491",
        "0"
    ],
    [
        "1597026383085",
        "3.731",
        "3.799",
        "3.494",
        "3.72",
        "24912403",
        "67632347.24399722",
        "37632347.24399722",
        "1"
    ]
    ]
}
Response Parameters
Parameter	Type	Description
ts	String	Opening time of the candlestick, Unix timestamp format in milliseconds, e.g. 1597026383085
o	String	Open price
h	String	highest price
l	String	Lowest price
c	String	Close price
vol	String	Trading volume, with a unit of contract.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
volCcy	String	Trading volume, with a unit of currency.
If it is a derivatives contract, the value is the number of base currency.
If it is SPOT/MARGIN, the value is the quantity in quote currency.
volCcyQuote	String	Trading volume, the value is the quantity in quote currency
e.g. The unit is USDT for BTC-USDT and BTC-USDT-SWAP;
The unit is USD for BTC-USD-SWAP
confirm	String	The state of candlesticks.
0: K line is uncompleted
1: K line is completed
The first candlestick data may be incomplete, and should not be polled repeatedly.

The data returned will be arranged in an array like this: [ts,o,h,l,c,vol,volCcy,volCcyQuote,confirm].

For the current cycle of k-line data, when there is no transaction, the opening high and closing low default take the closing price of the previous cycle.
GET / Candlesticks history
Retrieve history candlestick charts from recent years(It is last 3 months supported for 1s candlestick).

Rate Limit: 20 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/market/history-candles

Request Example

GET /api/v5/market/history-candles?instId=BTC-USDT
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USDT
after	String	No	Pagination of data to return records earlier than the requested ts
before	String	No	Pagination of data to return records newer than the requested ts. The latest data will be returned when using before individually
bar	String	No	Bar size, the default is 1m
e.g. [1s/1m/3m/5m/15m/30m/1H/2H/4H]
UTC+8 opening price k-line: [6H/12H/1D/2D/3D/1W/1M/3M]
UTC+0 opening price k-line: [6Hutc/12Hutc/1Dutc/2Dutc/3Dutc/1Wutc/1Mutc/3Mutc]
limit	String	No	Number of results per request. The maximum is 300. The default is 100.
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
     [
        "1597026383085",
        "3.721",
        "3.743",
        "3.677",
        "3.708",
        "8422410",
        "22698348.04828491",
        "12698348.04828491",
        "1"
    ],
    [
        "1597026383085",
        "3.731",
        "3.799",
        "3.494",
        "3.72",
        "24912403",
        "67632347.24399722",
        "37632347.24399722",
        "1"
    ]
    ]
}
Response Parameters
Parameter	Type	Description
ts	String	Opening time of the candlestick, Unix timestamp format in milliseconds, e.g. 1597026383085
o	String	Open price
h	String	Highest price
l	String	Lowest price
c	String	Close price
vol	String	Trading volume, with a unit of contract.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
volCcy	String	Trading volume, with a unit of currency.
If it is a derivatives contract, the value is the number of base currency.
If it is SPOT/MARGIN, the value is the quantity in quote currency.
volCcyQuote	String	Trading volume, the value is the quantity in quote currency
e.g. The unit is USDT for BTC-USDT and BTC-USDT-SWAP;
The unit is USD for BTC-USD-SWAP
confirm	String	The state of candlesticks
0: K line is uncompleted
1: K line is completed
The data returned will be arranged in an array like this: [ts,o,h,l,c,vol,volCcy,volCcyQuote,confirm]

 1s candle is not supported by OPTION, but it is supported by other business lines (SPOT, MARGIN, FUTURES and SWAP)
GET / Trades
Retrieve the recent transactions of an instrument.

Rate Limit: 100 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/market/trades

Request Example

GET /api/v5/market/trades?instId=BTC-USDT
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USDT
limit	String	No	Number of results per request. The maximum is 500; The default is 100
Response Example

{
    "code": "0",
    "msg": "",
    "data": [
        {
            "instId": "BTC-USDT",
            "side": "sell",
            "sz": "0.00001",
            "source": "0",
            "px": "29963.2",
            "tradeId": "242720720",
            "ts": "1654161646974"
        },
        {
            "instId": "BTC-USDT",
            "side": "sell",
            "sz": "0.00001",
            "source": "0",
            "px": "29964.1",
            "tradeId": "242720719",
            "ts": "1654161641568"
        }
    ]
}
Response Parameters
Parameter	Type	Description
instId	String	Instrument ID
tradeId	String	Trade ID
px	String	Trade price
sz	String	Trade quantity
For spot trading, the unit is base currency
For FUTURES/SWAP/OPTION, the unit is contract.
side	String	Trade side of taker
buy
sell
source	String	Order source
0: normal order
1: Enhanced Liquidity Program order
ts	String	Trade time, Unix timestamp format in milliseconds, e.g. 1597026383085.
 Up to 500 most recent historical public transaction data can be retrieved.
GET / Trades history
Retrieve the recent transactions of an instrument from the last 3 months with pagination.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/market/history-trades

Request Example

GET /api/v5/market/history-trades?instId=BTC-USDT
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USDT
type	String	No	Pagination Type
1: tradeId 2: timestamp
The default is 1
after	String	No	Pagination of data to return records earlier than the requested tradeId or ts.
before	String	No	Pagination of data to return records newer than the requested tradeId.
Do not support timestamp for pagination. The latest data will be returned when using before individually
limit	String	No	Number of results per request. The maximum and default both are 100
Response Example

{
    "code": "0",
    "msg": "",
    "data": [
        {
            "instId": "BTC-USDT",
            "side": "sell",
            "sz": "0.00001",
            "source": "0",
            "px": "29963.2",
            "tradeId": "242720720",
            "ts": "1654161646974"
        },
        {
            "instId": "BTC-USDT",
            "side": "sell",
            "sz": "0.00001",
            "source": "0",
            "px": "29964.1",
            "tradeId": "242720719",
            "ts": "1654161641568"
        }
    ]
}
Response Parameters
Parameter	Type	Description
instId	String	Instrument ID
tradeId	String	Trade ID
px	String	Trade price
sz	String	Trade quantity
For spot trading, the unit is base currency
For FUTURES/SWAP/OPTION, the unit is contract.
side	String	Trade side of taker
buy
sell
source	String	Order source
0: normal order
1: Enhanced Liquidity Program order
ts	String	Trade time, Unix timestamp format in milliseconds, e.g. 1597026383085.
WS / Tickers channel
Retrieve the last traded price, bid price, ask price and 24-hour trading volume of instruments. Best ask price may be lower than the best bid price during the pre-open period.
The fastest rate is 1 update/100ms. There will be no update if the event is not triggered. The events which can trigger update: trade, the change on best ask/bid.

URL Path
/ws/v5/public

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "tickers",
      "instId": "BTC-USDT"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
tickers
> instId	String	Yes	Instrument ID
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "tickers",
    "instId": "BTC-USDT"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"tickers\", \"instId\" : \"LTC-USD-200327\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instId	String	Yes	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
  "arg": {
    "channel": "tickers",
    "instId": "BTC-USDT"
  },
  "data": [
    {
      "instType": "SPOT",
      "instId": "BTC-USDT",
      "last": "9999.99",
      "lastSz": "0.1",
      "askPx": "9999.99",
      "askSz": "11",
      "bidPx": "8888.88",
      "bidSz": "5",
      "open24h": "9000",
      "high24h": "10000",
      "low24h": "8888.88",
      "volCcy24h": "2222",
      "vol24h": "2222",
      "sodUtc0": "2222",
      "sodUtc8": "2222",
      "ts": "1597026383085"
    }
  ]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> instId	String	Instrument ID
data	Array of objects	Subscribed data
> instType	String	Instrument type
> instId	String	Instrument ID
> last	String	Last traded price
> lastSz	String	Last traded size. 0 represents there is no trading volume
> askPx	String	Best ask price
> askSz	String	Best ask size
> bidPx	String	Best bid price
> bidSz	String	Best bid size
> open24h	String	Open price in the past 24 hours
> high24h	String	Highest price in the past 24 hours
> low24h	String	Lowest price in the past 24 hours
> volCcy24h	String	24h trading volume, with a unit of currency.
If it is a derivatives contract, the value is the number of base currency.
If it is SPOT/MARGIN, the value is the quantity in quote currency.
> vol24h	String	24h trading volume, with a unit of contract.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
> sodUtc0	String	Open price in the UTC 0
> sodUtc8	String	Open price in the UTC 8
> ts	String	Ticker data generation time, Unix timestamp format in milliseconds, e.g. 1597026383085
WS / Candlesticks channel
Retrieve the candlesticks data of an instrument. the push frequency is the fastest interval 1 second push the data.

URL Path
/ws/v5/business

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "candle1D",
      "instId": "BTC-USDT"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
candle3M
candle1M
candle1W
candle1D
candle2D
candle3D
candle5D
candle12H
candle6H
candle4H
candle2H
candle1H
candle30m
candle15m
candle5m
candle3m
candle1m
candle1s
candle3Mutc
candle1Mutc
candle1Wutc
candle1Dutc
candle2Dutc
candle3Dutc
candle5Dutc
candle12Hutc
candle6Hutc
> instId	String	Yes	Instrument ID
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "candle1D",
    "instId": "BTC-USDT"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"candle1D\", \"instId\" : \"BTC-USD-191227\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	yes	channel name
> instId	String	Yes	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
  "arg": {
    "channel": "candle1D",
    "instId": "BTC-USDT"
  },
  "data": [
    [
      "1597026383085",
      "8533.02",
      "8553.74",
      "8527.17",
      "8548.26",
      "45247",
      "529.5858061",
      "5529.5858061",
      "0"
    ]
  ]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> instId	String	Instrument ID
data	Array of Arrays	Subscribed data
> ts	String	Opening time of the candlestick, Unix timestamp format in milliseconds, e.g. 1597026383085
> o	String	Open price
> h	String	highest price
> l	String	Lowest price
> c	String	Close price
> vol	String	Trading volume, with a unit of contract.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
> volCcy	String	Trading volume, with a unit of currency.
If it is a derivatives contract, the value is the number of base currency.
If it is SPOT/MARGIN, the value is the quantity in quote currency.
> volCcyQuote	String	Trading volume, the value is the quantity in quote currency
e.g. The unit is USDT for BTC-USDT and BTC-USDT-SWAP
The unit is USD for BTC-USD-SWAP
> confirm	String	The state of candlesticks
0: K line is uncompleted
1: K line is completed
WS / Trades channel
Retrieve the recent trades data. Data will be pushed whenever there is a trade. Every update may aggregate multiple trades.


The message is sent only once per taker order, filled price, source. The count field is used to represent the number of aggregated matches.

URL Path
/ws/v5/public

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "trades",
      "instId": "BTC-USDT"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
trades
> instId	String	Yes	Instrument ID
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
      "channel": "trades",
      "instId": "BTC-USDT"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"trades\", \"instId\" : \"BTC-USD-191227\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instId	String	Yes	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
  "arg": {
    "channel": "trades",
    "instId": "BTC-USDT"
  },
  "data": [
    {
      "instId": "BTC-USDT",
      "tradeId": "130639474",
      "px": "42219.9",
      "sz": "0.12060306",
      "side": "buy",
      "ts": "1630048897897",
      "count": "3",
      "source": "0",
      "seqId": 1234
    }
  ]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> instId	String	Instrument ID
data	Array of objects	Subscribed data
> instId	String	Instrument ID, e.g. BTC-USDT
> tradeId	String	The last trade ID in the trades aggregation
> px	String	Trade price
> sz	String	Trade quantity
For spot trading, the unit is base currency
For FUTURES/SWAP/OPTION, the unit is contract.
> side	String	Trade side of taker
buy
sell
> ts	String	Filled time, Unix timestamp format in milliseconds, e.g. 1597026383085
> count	String	The count of trades aggregated
> source	String	Order source
0: normal orders
1: Enhanced Liquidity Program order
> seqId	Integer	Sequence ID of the current message.
 Aggregation function description:
1. The system will send only one message per taker order, filled price, source. The `count` field will be used to represent the number of aggregated matches.
2. The `tradeId` field in the message becomes the last trade ID in the aggregation.
3. When the `count` = 1, it means the taker order matches only one maker order with the specific price.
4. When the `count` > 1, it means the taker order matches multiple maker orders with the same price. For example, if `tradeId` = 123 and `count` = 3, it means the message aggregates the trades of `tradeId` = 123, 122, and 121. Maker side has filled multiple orders.
5. Users can use this information to compare with data from the `trades-all` channel.
6. Order book and the aggregated trades data are still published sequentially.
 The seqId may be the same for different trade updates that occur at the same time.
WS / All trades channel
Retrieve the recent trades data. Data will be pushed whenever there is a trade. Every update contain only one trade.

URL Path
/ws/v5/business

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "trades-all",
      "instId": "BTC-USDT"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
trades-all
> instId	String	Yes	Instrument ID
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
      "channel": "trades-all",
      "instId": "BTC-USDT"
    },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"trades-all\", \"instId\" : \"BTC-USD-191227\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instId	String	Yes	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
  "arg": {
    "channel": "trades-all",
    "instId": "BTC-USDT"
  },
  "data": [
    {
      "instId": "BTC-USDT",
      "tradeId": "130639474",
      "px": "42219.9",
      "sz": "0.12060306",
      "side": "buy",
      "source": "0",
      "ts": "1630048897897"
    }
  ]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> instId	String	Instrument ID
data	Array of objects	Subscribed data
> instId	String	Instrument ID, e.g. BTC-USDT
> tradeId	String	Trade ID
> px	String	Trade price
> sz	String	Trade quantity
For spot trading, the unit is base currency
For FUTURES/SWAP/OPTION, the unit is contract.
> side	String	Trade direction
buy
sell
> source	String	Order source
0: normal
1: Enhanced Liquidity Program order
> ts	String	Filled time, Unix timestamp format in milliseconds, e.g. 1597026383085
WS / Order book channel
Retrieve order book data. Best ask price may be lower than the best bid price during the pre-open period.

Use books for 400 depth levels, books5 for 5 depth levels, bbo-tbt tick-by-tick 1 depth level, books50-l2-tbt tick-by-tick 50 depth levels, and books-l2-tbt for tick-by-tick 400 depth levels.

books: 400 depth levels will be pushed in the initial full snapshot. Incremental data will be pushed every 100 ms for the changes in the order book during that period of time.
books-elp: only push ELP orders. 400 depth levels will be pushed in the initial full snapshot. Incremental data will be pushed every 100 ms for the changes in the order book during that period of time.
books5: 5 depth levels snapshot will be pushed in the initial push. Snapshot data will be pushed every 100 ms when there are changes in the 5 depth levels snapshot.
bbo-tbt: 1 depth level snapshot will be pushed in the initial push. Snapshot data will be pushed every 10 ms when there are changes in the 1 depth level snapshot.
books-l2-tbt: 400 depth levels will be pushed in the initial full snapshot. Incremental data will be pushed every 10 ms for the changes in the order book during that period of time.
books50-l2-tbt: 50 depth levels will be pushed in the initial full snapshot. Incremental data will be pushed every 10 ms for the changes in the order book during that period of time.
The push sequence for order book channels within the same connection and trading symbols is fixed as: bbo-tbt -> books-l2-tbt -> books50-l2-tbt -> books -> books-elp -> books5.
Users can not simultaneously subscribe to books-l2-tbt and books50-l2-tbt/books channels for the same trading symbol.
For more details, please refer to the changelog 2024-07-17
 Only API users who are VIP4 and above in trading fee tier are allowed to subscribe to "books-l2-tbt" 400 depth channels. Other users will receive error code 64003.
Only API users who are VIP4 and above in trading fee tier are allowed to subscribe to "books50-l2-tbt" 50 depth channels. Other users will receive error code 64003.
Identity verification refers to Login

URL Path
/ws/v5/public

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "books",
      "instId": "BTC-USDT"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
books
books5
bbo-tbt
books50-l2-tbt
books-l2-tbt
> instId	String	Yes	Instrument ID
Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "books",
    "instId": "BTC-USDT"
  },
  "connId": "a4d3ae55"
}
Failure example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"books\", \"instId\" : \"BTC-USD-191227\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instId	String	Yes	Instrument ID
msg	String	No	Error message
code	String	No	Error code
connId	String	Yes	WebSocket connection ID
Push Data Example: Full Snapshot

{
  "arg": {
    "channel": "books",
    "instId": "BTC-USDT"
  },
  "action": "snapshot",
  "data": [
    {
      "asks": [
        ["8476.98", "415", "0", "13"],
        ["8477", "7", "0", "2"],
        ["8477.34", "85", "0", "1"],
        ["8477.56", "1", "0", "1"],
        ["8505.84", "8", "0", "1"],
        ["8506.37", "85", "0", "1"],
        ["8506.49", "2", "0", "1"],
        ["8506.96", "100", "0", "2"]
      ],
      "bids": [
        ["8476.97", "256", "0", "12"],
        ["8475.55", "101", "0", "1"],
        ["8475.54", "100", "0", "1"],
        ["8475.3", "1", "0", "1"],
        ["8447.32", "6", "0", "1"],
        ["8447.02", "246", "0", "1"],
        ["8446.83", "24", "0", "1"],
        ["8446", "95", "0", "3"]
      ],
      "ts": "1597026383085",
      "checksum": -855196043,
      "prevSeqId": -1,
      "seqId": 123456
    }
  ]
}
Push Data Example: Incremental Data

{
  "arg": {
    "channel": "books",
    "instId": "BTC-USDT"
  },
  "action": "update",
  "data": [
    {
      "asks": [
        ["8476.98", "415", "0", "13"],
        ["8477", "7", "0", "2"],
        ["8477.34", "85", "0", "1"],
        ["8477.56", "1", "0", "1"],
        ["8505.84", "8", "0", "1"],
        ["8506.37", "85", "0", "1"],
        ["8506.49", "2", "0", "1"],
        ["8506.96", "100", "0", "2"]
      ],
      "bids": [
        ["8476.97", "256", "0", "12"],
        ["8475.55", "101", "0", "1"],
        ["8475.54", "100", "0", "1"],
        ["8475.3", "1", "0", "1"],
        ["8447.32", "6", "0", "1"],
        ["8447.02", "246", "0", "1"],
        ["8446.83", "24", "0", "1"],
        ["8446", "95", "0", "3"]
      ],
      "ts": "1597026383085",
      "checksum": -855196043,
      "prevSeqId": 123456,
      "seqId": 123457
    }
  ]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> instId	String	Instrument ID
action	String	Push data action, incremental data or full snapshot.
snapshot: full
update: incremental
data	Array of objects	Subscribed data
> asks	Array of Arrays	Order book on sell side
> bids	Array of Arrays	Order book on buy side
> ts	String	Order book generation time, Unix timestamp format in milliseconds, e.g. 1597026383085
Exception: For the bbo-tbt channel, ts is the timestamp when the book is generated by matching engine.
> checksum	Integer	Checksum, implementation details below
> prevSeqId	Integer	Sequence ID of the last sent message. Only applicable to books, books-l2-tbt, books50-l2-tbt
> seqId	Integer	Sequence ID of the current message, implementation details below
 An example of the array of asks and bids values: ["411.8", "10", "0", "4"]
- "411.8" is the depth price
- "10" is the quantity at the price (number of contracts for derivatives, quantity in base currency for Spot and Spot Margin)
- "0" is part of a deprecated feature and it is always "0"
- "4" is the number of orders at the price.
 If you need to subscribe to many 50 or 400 depth level channels, it is recommended to subscribe through multiple websocket connections, with each of less than 30 channels.
 The order book data will be updated around once a second during the call auction.
 `books/books5/bbo-tbt/books-l2-tbt/books50-l2-tbt` don't return ELP orders
`books-elp` only return ELP orders, including both valid and invalid parts (invalid parts means ELP buy orders with a price higher than best bid of non-ELP orders; or ELP sell orders with a price lower than best ask of non-ELP orders). Users should distinguish valid and invalid parts using the best bid/ask price of non-ELP orders.
Sequence ID
seqId is the sequence ID of the market data published. The set of sequence ID received by users is the same if users are connecting to the same channel through multiple websocket connections. Each instId has an unique set of sequence ID. Users can use prevSeqId and seqId to build the message sequencing for incremental order book updates. Generally the value of seqId is larger than prevSeqId. The prevSeqId in the new message matches with seqId of the previous message. The smallest possible sequence ID value is 0, except in snapshot messages where the prevSeqId is always -1.

Exceptions:
1. If there are no updates to the depth for an extended period(Around 60 seconds), for the channel that always updates snapshot data, OKX will send the latest snapshot, for the channel that has incremental data, OKX will send a message with 'asks': [], 'bids': [] to inform users that the connection is still active. seqId is the same as the last sent message and prevSeqId equals to seqId. 2. The sequence number may be reset due to maintenance, and in this case, users will receive an incremental message with seqId smaller than prevSeqId. However, subsequent messages will follow the regular sequencing rule.

Example
Snapshot message: prevSeqId = -1, seqId = 10
Incremental message 1 (normal update): prevSeqId = 10, seqId = 15
Incremental message 2 (no update): prevSeqId = 15, seqId = 15
Incremental message 3 (sequence reset): prevSeqId = 15, seqId = 3
Incremental message 4 (normal update): prevSeqId = 3, seqId = 5
Checksum
This mechanism can assist users in checking the accuracy of depth data.

Merging incremental data into full data
After subscribing to the incremental load push (such as books 400 levels) of Order Book Channel, users first receive the initial full load of market depth. After the incremental load is subsequently received, update the local full load.

If there is the same price, compare the size. If the size is 0, delete this depth data. If the size changes, replace the original data.
If there is no same price, sort by price (bid in descending order, ask in ascending order), and insert the depth information into the full load.
Calculate Checksum
Use the first 25 bids and asks in the full load to form a string (where a colon connects the price and size in an ask or a bid), and then calculate the CRC32 value (32-bit signed integer).

Calculate Checksum

1. More than 25 levels of bid and ask
A full load of market depth (only 2 levels of data are shown here, while 25 levels of data should actually be intercepted):
{
    "bids": [
        ["3366.1", "7", "0", "3"],
        ["3366", "6", "3", "4"]
    ],
    "asks": [
        ["3366.8", "9", "10", "3"],
        ["3368", "8", "3", "4"]
    ]
}
Check string:
"3366.1:7:3366.8:9:3366:6:3368:8"

2. Less than 25 levels of bid or ask
A full load of market depth:
{
    "bids": [
        ["3366.1", "7", "0", "3"]
    ],
    "asks": [
        ["3366.8", "9", "10", "3"],
        ["3368", "8", "3", "4"],
        ["3372", "8", "3", "4"]
    ]
}
Check string:
"3366.1:7:3366.8:9:3368:8:3372:8"
When the bid and ask depth data exceeds 25 levels, each of them will intercept 25 levels of data, and the string to be checked is queued in a way that the bid and ask depth data are alternately arranged.
Such as: bid[price:size]:ask[price:size]:bid[price:size]:ask[price:size]...
When the bid or ask depth data is less than 25 levels, the missing depth data will be ignored.
Such as: bid[price:size]:ask[price:size]:asks[price:size]:asks[price:size]...
Push Data Example of bbo-tbt channel

{
  "arg": {
    "channel": "bbo-tbt",
    "instId": "BCH-USDT-SWAP"
  },
  "data": [
    {
      "asks": [
        [
          "111.06","55154","0","2"
        ]
      ],
      "bids": [
        [
          "111.05","57745","0","2"
        ]
      ],
      "ts": "1670324386802",
      "seqId": 363996337
    }
  ]
}
Push Data Example of books5 channel

{
  "arg": {
    "channel": "books5",
    "instId": "BCH-USDT-SWAP"
  },
  "data": [
    {
      "asks": [
        ["111.06","55154","0","2"],
        ["111.07","53276","0","2"],
        ["111.08","72435","0","2"],
        ["111.09","70312","0","2"],
        ["111.1","67272","0","2"]],
      "bids": [
        ["111.05","57745","0","2"],
        ["111.04","57109","0","2"],
        ["111.03","69563","0","2"],
        ["111.02","71248","0","2"],
        ["111.01","65090","0","2"]],
      "instId": "BCH-USDT-SWAP",
      "ts": "1670324386802",
      "seqId": 363996337
    }
  ]
}
Public Data
The API endpoints of Public Data do not require authentication.

REST API
Get instruments
Retrieve a list of instruments with open contracts for OKX. Retrieve available instruments info of current account, please refer to Get instruments.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: IP + Instrument Type
HTTP Request
GET /api/v5/public/instruments

Request Example

GET /api/v5/public/instruments?instType=SPOT
Request Parameters
Parameter	Type	Required	Description
instType	String	Yes	Instrument type
SPOT: Spot
MARGIN: Margin
SWAP: Perpetual Futures
FUTURES: Expiry Futures
OPTION: Option
instFamily	String	Conditional	Instrument family
Only applicable to FUTURES/SWAP/OPTION. If instType is OPTION, instFamily is required.
instId	String	No	Instrument ID
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
      {
            "alias": "",
            "auctionEndTime": "",
            "baseCcy": "BTC",
            "category": "1",
            "ctMult": "",
            "ctType": "",
            "ctVal": "",
            "ctValCcy": "",
            "contTdSwTime": "1704876947000",
            "expTime": "",
            "futureSettlement": false,
            "groupId": "1",
            "instFamily": "",
            "instId": "BTC-USDT",
            "instType": "SPOT",
            "lever": "10",
            "listTime": "1606468572000",
            "lotSz": "0.00000001",
            "maxIcebergSz": "9999999999.0000000000000000",
            "maxLmtAmt": "1000000",
            "maxLmtSz": "9999999999",
            "maxMktAmt": "1000000",
            "maxMktSz": "",
            "maxStopSz": "",
            "maxTriggerSz": "9999999999.0000000000000000",
            "maxTwapSz": "9999999999.0000000000000000",
            "minSz": "0.00001",
            "optType": "",
            "openType": "call_auction",
            "preMktSwTime": "",
            "quoteCcy": "USDT",
            "tradeQuoteCcyList": [
                "USDT"
            ],
            "settleCcy": "",
            "state": "live",
            "ruleType": "normal",
            "stk": "",
            "tickSz": "0.1",
            "uly": "",
            "instIdCode": 1000000000,
            "instCategory": "1",
            "upcChg": [
                {
                    "param": "tickSz",
                    "newValue": "0.0001",
                    "effTime": "1704876947000"
                }
            ]
        }
    ]
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID, e.g. BTC-USD-SWAP
uly	String	Underlying, e.g. BTC-USD
Only applicable to MARGIN/FUTURES/SWAP/OPTION
groupId	String	Instrument trading fee group ID
Spot:
1: Spot USDT
2: Spot USDC & Crypto
3: Spot TRY
4: Spot EUR
5: Spot BRL
7: Spot AED
8: Spot AUD
9: Spot USD
10: Spot SGD
11: Spot zero
12: Spot group one
13: Spot group two
14: Spot group three
15: Spot special rule

Expiry futures:
1: Expiry futures crypto-margined
2: Expiry futures USDT-margined
3: Expiry futures USDC-margined
4: Expiry futures premarket
5: Expiry futures group one
6: Expiry futures group two

Perpetual futures:
1: Perpetual futures crypto-margined
2: Perpetual futures USDT-margined
3: Perpetual futures USDC-margined
4: Perpetual futures group one
5: Perpetual futures group two
6: Stock perpetual futures

Options:
1: Options crypto-margined
2: Options USDC-margined

instType and groupId should be used together to determine a trading fee group. Users should use this endpoint together with fee rates endpoint to get the trading fee of a specific symbol.

Some enum values may not apply to you; the actual return values shall prevail.
instFamily	String	Instrument family, e.g. BTC-USD
Only applicable to MARGIN/FUTURES/SWAP/OPTION
category	String	Currency category. Note: this parameter is already deprecated
baseCcy	String	Base currency, e.g. BTC inBTC-USDT
Only applicable to SPOT/MARGIN
quoteCcy	String	Quote currency, e.g. USDT in BTC-USDT
Only applicable to SPOT/MARGIN
settleCcy	String	Settlement and margin currency, e.g. BTC
Only applicable to FUTURES/SWAP/OPTION
ctVal	String	Contract value
Only applicable to FUTURES/SWAP/OPTION
ctMult	String	Contract multiplier
Only applicable to FUTURES/SWAP/OPTION
ctValCcy	String	Contract value currency
Only applicable to FUTURES/SWAP/OPTION
optType	String	Option type, C: Call P: put
Only applicable to OPTION
stk	String	Strike price
Only applicable to OPTION
listTime	String	Listing time, Unix timestamp format in milliseconds, e.g. 1597026383085
auctionEndTime	String	The end time of call auction, Unix timestamp format in milliseconds, e.g. 1597026383085
Only applicable to SPOT that are listed through call auctions, return "" in other cases (deprecated, use contTdSwTime)
contTdSwTime	String	Continuous trading switch time. The switch time from call auction, prequote to continuous trading, Unix timestamp format in milliseconds. e.g. 1597026383085.
Only applicable to SPOT/MARGIN that are listed through call auction or prequote, return "" in other cases.
preMktSwTime	String	The time premarket swap switched to normal swap, Unix timestamp format in milliseconds, e.g. 1597026383085.
Only applicable premarket SWAP
openType	String	Open type
fix_price: fix price opening
pre_quote: pre-quote
call_auction: call auction
Only applicable to SPOT/MARGIN, return "" for all other business lines
expTime	String	Expiry time
Applicable to SPOT/MARGIN/FUTURES/SWAP/OPTION. For FUTURES/OPTION, it is natural delivery/exercise time. It is the instrument offline time when there is SPOT/MARGIN/FUTURES/SWAP/ manual offline. Update once change.
lever	String	Max Leverage,
Not applicable to SPOT, OPTION
tickSz	String	Tick size, e.g. 0.0001
For Option, it is minimum tickSz among tick band, please use "Get option tick bands" if you want get option tickBands.
lotSz	String	Lot size
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
minSz	String	Minimum order size
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
ctType	String	Contract type
linear: linear contract
inverse: inverse contract
Only applicable to FUTURES/SWAP
alias	String	Contract alias (deprecated — use expTime to obtain the delivery time, will be removed by the end of April 2026)
this_week
next_week
this_month
next_month
quarter
next_quarter
third_quarter
this_five_years: current 5-year contract
next_five_years: next 5-year contract
Only applicable to FUTURES
state	String	Instrument status
live
suspend
rebase: can't be traded during rebasing, only applicable to SWAP
preopen. e.g. There will be preopen before the Futures and Options new contracts state is live.
test: Test pairs, can’t be traded
ruleType	String	Trading rule types
normal: normal trading
pre_market: pre-market trading
rebase_contract: pre-market rebase contract
xperp: perpetual-style futures, only applicable to certain FUTURES contracts
maxLmtSz	String	The maximum order quantity of a single limit order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
maxMktSz	String	The maximum order quantity of a single market order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in USDT.
maxLmtAmt	String	Max USD amount for a single limit order
maxMktAmt	String	Max USD amount for a single market order
Only applicable to SPOT/MARGIN
maxTwapSz	String	The maximum order quantity of a single TWAP order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
The minimum order quantity of a single TWAP order is minSz*2
maxIcebergSz	String	The maximum order quantity of a single iceBerg order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
maxTriggerSz	String	The maximum order quantity of a single trigger order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
maxStopSz	String	The maximum order quantity of a single stop market order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in USDT.
futureSettlement	Boolean	Whether daily settlement for expiry feature is enabled
Applicable to FUTURES cross
tradeQuoteCcyList	Array of strings	List of quote currencies available for trading, e.g. ["USD", "USDC”].
instIdCode	Integer	Instrument ID code.
For simple binary encoding, you must use instIdCode instead of instId.
For the same instId, it's value may be different between production and demo trading.
It is null when the value is not generated.
instCategory	String	The asset category of the instrument’s base asset (the first segment of the instrument ID). For example, for BTC-USDT-SWAP, the instCategory represents the asset category of BTC.
1: Crypto
3: Stocks
4: Commodities
5: Forex
6: Bonds
"": Not available
upcChg	Array of objects	Upcoming changes. It is [] when there is no upcoming change.
> param	String	The parameter name to be updated.
tickSz
minSz
maxMktSz
> newValue	String	The parameter value that will replace the current one.
> effTime	String	Effective time. Unix timestamp format in milliseconds, e.g. 1597026383085
 When a new contract is going to be listed, the instrument data of the new contract will be available with status preopen. When a product is going to be delisted (e.g. when a FUTURES contract is settled or OPTION contract is exercised), the instrument will not be available
 listTime and contTdSwTime
For spot symbols listed through a call auction or pre-open, listTime represents the start time of the auction or pre-open, and contTdSwTime indicates the end of the auction or pre-open and the start of continuous trading. For other scenarios, listTime will mark the beginning of continuous trading, and contTdSwTime will return an empty value "".
 state
The state will always change from `preopen` to `live` when the listTime is reached.
When a product is going to be delisted (e.g. when a FUTURES contract is settled or OPTION contract is exercised), the instrument will not be available.
 Instruments REST endpoints and WebSocket channel will update `expTime` once the delisting announcement is published.
Instruments REST endpoint and WebSocket channel will update `listTime` once the listing announcement is published:
1. For `SPOT/MARGIN/SWAP`, this event is only applicable to `instType`, `instId`, `listTime`, `state`.
2. For `FUTURES`, this event is only applicable to `instType`, `instFamily`, `listTime`, `state`.
3. Other fields will be "" temporarily, but they will be updated at least 5 minutes in advance of the `listTime`, then the WebSocket subscription using related `instId`/`instFamily` can be available.
Get estimated delivery/exercise price
Retrieve the estimated delivery price which will only have a return value one hour before the delivery/exercise.

Rate Limit: 10 requests per 2 seconds
Rate limit rule: IP + Instrument ID
HTTP Request
GET /api/v5/public/estimated-price

Request Example

GET /api/v5/public/estimated-price?instId=BTC-USD-200214
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USD-200214
only applicable to FUTURES/OPTION
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
    {
        "instType":"FUTURES",
        "instId":"BTC-USDT-201227",
        "settlePx":"200",
        "ts":"1597026383085"
    }
  ]
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
FUTURES
OPTION
instId	String	Instrument ID, e.g. BTC-USD-200214
settlePx	String	Estimated delivery/exercise price
ts	String	Data return time, Unix timestamp format in milliseconds, e.g. 1597026383085
Get delivery/exercise history
Retrieve delivery records of Futures and exercise records of Options in the last 3 months.

Rate Limit: 40 requests per 2 seconds
Rate limit rule: IP + (Instrument Type + instFamily)
HTTP Request
GET /api/v5/public/delivery-exercise-history

Request Example

GET /api/v5/public/delivery-exercise-history?instType=OPTION&instFamily=BTC-USD
Request Parameters
Parameter	Type	Required	Description
instType	String	Yes	Instrument type
FUTURES
OPTION
instFamily	String	Yes	Instrument family, only applicable to FUTURES/OPTION
after	String	No	Pagination of data to return records earlier than the requested ts
before	String	No	Pagination of data to return records newer than the requested ts
limit	String	No	Number of results per request. The maximum is 100; The default is 100
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
        {
            "ts":"1597026383085",
            "details":[
                {
                    "type":"delivery",
                    "insId":"BTC-USD-190927",
                    "px":"0.016"
                }
            ]
        },
        {
            "ts":"1597026383085",
            "details":[
                {
                    "insId":"BTC-USD-200529-6000-C",
                    "type":"exercised",
                    "px":"0.016"
                },
                {
                    "insId":"BTC-USD-200529-8000-C",
                    "type":"exercised",
                    "px":"0.016"
                }
            ]
        }
    ]
}
Response Parameters
Parameter	Type	Description
ts	String	Delivery/exercise time, Unix timestamp format in milliseconds, e.g. 1597026383085
details	Array of objects	Delivery/exercise details
> insId	String	Delivery/exercise contract ID
> px	String	Delivery/exercise price
> type	String	Type
delivery
exercised
expired_otm:Out of the money
Get funding rate
Retrieve funding rate.

Rate Limit: 10 requests per 2 seconds
Rate limit rule: IP + Instrument ID
HTTP Request
GET /api/v5/public/funding-rate

Request Example

GET /api/v5/public/funding-rate?instId=BTC-USD-SWAP
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USD-SWAP or X-Perps futures instId, or ANY to return the funding rate info of all perpetual and X-Perps futures contracts
Applicable to SWAP and X-Perps FUTURES
Response Example

{
    "code": "0",
    "data": [
        {
            "formulaType": "noRate",
            "fundingRate": "0.0000182221218054",
            "fundingTime": "1743609600000",
            "impactValue": "",
            "instId": "BTC-USDT-SWAP",
            "instType": "SWAP",
            "interestRate": "",
            "maxFundingRate": "0.00375",
            "method": "current_period",
            "minFundingRate": "-0.00375",
            "nextFundingRate": "",
            "nextFundingTime": "1743638400000",
            "premium": "0.0000910113652644",
            "settFundingRate": "0.0000145824401745",
            "settState": "settled",
            "ts": "1743588686291"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
SWAP: Perpetual futures
FUTURES: X-Perps futures
instId	String	Instrument ID, e.g. BTC-USD-SWAP or ANY
method	String	Funding rate mechanism
current_period
next_period(no longer supported)
formulaType	String	Formula type
noRate: old funding rate formula
withRate: new funding rate formula
fundingRate	String	Current funding rate
nextFundingRate	String	Forecasted funding rate for the next period
The nextFundingRate will be "" if the method is current_period(no longer supported)
fundingTime	String	Settlement time, Unix timestamp format in milliseconds, e.g. 1597026383085
nextFundingTime	String	Forecasted funding time for the next period , Unix timestamp format in milliseconds, e.g. 1597026383085
minFundingRate	String	The lower limit of the funding rate
maxFundingRate	String	The upper limit of the funding rate
interestRate	String	Interest rate
impactValue	String	Depth weighted amount (in the unit of quote currency)
settState	String	Settlement state of funding rate
processing
settled
settFundingRate	String	If settState = processing, it is the funding rate that is being used for current settlement cycle.
If settState = settled, it is the funding rate that is being used for previous settlement cycle
premium	String	Premium index
formula: [Max (0, Impact bid price – Index price) – Max (0, Index price – Impact ask price)] / Index price
ts	String	Data return time, Unix timestamp format in milliseconds, e.g. 1597026383085
 For some altcoins perpetual swaps with significant fluctuations in funding rates, OKX will closely monitor market changes. When necessary, the funding rate collection frequency, currently set at 8 hours, may be adjusted to higher frequencies such as 6 hours, 4 hours, 2 hours, or 1 hour. Thus, users should focus on the difference between `fundingTime` and `nextFundingTime` fields to determine the funding fee interval of a contract.
Get funding rate history
Retrieve funding rate history. This endpoint can return data up to three months.

Rate Limit: 10 requests per 2 seconds
Rate limit rule: IP + Instrument ID
HTTP Request
GET /api/v5/public/funding-rate-history

Request Example

GET /api/v5/public/funding-rate-history?instId=BTC-USD-SWAP
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USD-SWAP or X-Perps futures instId
Applicable to SWAP and X-Perps FUTURES
before	String	No	Pagination of data to return records newer than the requested fundingTime
after	String	No	Pagination of data to return records earlier than the requested fundingTime
limit	String	No	Number of results per request. The maximum is 400; The default is 400
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
        {
            "formulaType": "noRate",
            "fundingRate": "0.0000746604960499",
            "fundingTime": "1703059200000",
            "instId": "BTC-USD-SWAP",
            "instType": "SWAP",
            "method": "next_period",
            "realizedRate": "0.0000746572360545"
        },
        {
            "formulaType": "noRate",
            "fundingRate": "0.000227985782722",
            "fundingTime": "1703030400000",
            "instId": "BTC-USD-SWAP",
            "instType": "SWAP",
            "method": "next_period",
            "realizedRate": "0.0002279755647389"
        }
  ]
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
SWAP: Perpetual futures
FUTURES: X-Perps futures
instId	String	Instrument ID, e.g. BTC-USD-SWAP
formulaType	String	Formula type
noRate: old funding rate formula
withRate: new funding rate formula
fundingRate	String	Predicted funding rate
realizedRate	String	Actual funding rate
fundingTime	String	Settlement time, Unix timestamp format in milliseconds, e.g. 1597026383085
method	String	Funding rate mechanism
current_period
next_period
 For some altcoins perpetual swaps with significant fluctuations in funding rates, OKX will closely monitor market changes. When necessary, the funding rate collection frequency, currently set at 8 hours, may be adjusted to higher frequencies such as 6 hours, 4 hours, 2 hours, or 1 hour. Thus, users should focus on the difference between `fundingTime` and `nextFundingTime` fields to determine the funding fee interval of a contract.
Get open interest
Retrieve the total open interest for contracts on OKX.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: IP + Instrument ID
HTTP Request
GET /api/v5/public/open-interest

Request Example

GET /api/v5/public/open-interest?instType=SWAP
Request Parameters
Parameter	Type	Required	Description
instType	String	Yes	Instrument type
SWAP
FUTURES
OPTION
instFamily	String	Conditional	Instrument family
Applicable to FUTURES/SWAP/OPTION
If instType is OPTION, instFamily is required.
instId	String	No	Instrument ID, e.g. BTC-USDT-SWAP
Applicable to FUTURES/SWAP/OPTION
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
    {
        "instType":"SWAP",
        "instId":"BTC-USDT-SWAP",
        "oi":"5000",
        "oiCcy":"555.55",
        "oiUsd": "50000",
        "ts":"1597026383085"
    }
  ]
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID
oi	String	Open interest in number of contracts
oiCcy	String	Open interest in number of coin
oiUsd	String	Open interest in number of USD
ts	String	Data return time, Unix timestamp format in milliseconds, e.g. 1597026383085
Get limit price
Retrieve the highest buy limit and lowest sell limit of the instrument.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/public/price-limit

Request Example

GET /api/v5/public/price-limit?instId=BTC-USDT-SWAP
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USDT-SWAP
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
    {
        "instType":"SWAP",
        "instId":"BTC-USDT-SWAP",
        "buyLmt":"17057.9",
        "sellLmt":"16388.9",
        "ts":"1597026383085",
        "enabled": true
    }
  ]
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
instId	String	Instrument ID, e.g. BTC-USDT-SWAP
buyLmt	String	Highest buy limit
Return "" when enabled is false
sellLmt	String	Lowest sell limit
Return "" when enabled is false
ts	String	Data return time, Unix timestamp format in milliseconds, e.g. 1597026383085
enabled	Boolean	Whether price limit is effective
true: the price limit is effective
false: the price limit is not effective
Get system time
Retrieve API server time.

Rate Limit: 10 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/public/time

Request Example

GET /api/v5/public/time
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
    {
        "ts":"1597026383085"
    }
  ]
}
Response Parameters
Parameter	Type	Description
ts	String	System time, Unix timestamp format in milliseconds, e.g. 1597026383085
Get mark price
Retrieve mark price.

We set the mark price based on the SPOT index and at a reasonable basis to prevent individual users from manipulating the market and causing the contract price to fluctuate.

Rate Limit: 10 requests per 2 seconds
Rate limit rule: IP + Instrument ID
HTTP Request
GET /api/v5/public/mark-price

Request Example

GET /api/v5/public/mark-price?instType=SWAP
Request Parameters
Parameter	Type	Required	Description
instType	String	Yes	Instrument type
MARGIN
SWAP
FUTURES
OPTION
instFamily	String	No	Instrument family
Applicable to FUTURES/SWAP/OPTION
instId	String	No	Instrument ID, e.g. BTC-USD-SWAP
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
    {
        "instType":"SWAP",
        "instId":"BTC-USDT-SWAP",
        "markPx":"200",
        "ts":"1597026383085"
    }
  ]
}
Response Parameters
Parameter	Type	Description
instType	String	Instrument type
MARGIN
SWAP
FUTURES
OPTION
instId	String	Instrument ID, e.g. BTC-USD-200214
markPx	String	Mark price
ts	String	Data return time, Unix timestamp format in milliseconds, e.g. 1597026383085
Get position tiers
Retrieve position tiers information, maximum leverage depends on your borrowings and Maintenance margin ratio.

Rate Limit: 10 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/public/position-tiers

Request Example

GET /api/v5/public/position-tiers?tdMode=cross&instType=SWAP&instFamily=BTC-USDT
Request Parameters
Parameter	Type	Required	Description
instType	String	Yes	Instrument type
MARGIN
SWAP
FUTURES
OPTION
tdMode	String	Yes	Trade mode
Margin mode cross isolated
instFamily	String	Conditional	Single instrument familiy or multiple instrument families (no more than 5) separated with comma.
If instType is SWAP/FUTURES/OPTION, instFamily is required.
instId	String	Conditional	Single instrument or multiple instruments (no more than 5) separated with comma.
Either instId or ccy is required, if both are passed, instId will be used, ignore when instType is one of SWAP,FUTURES,OPTION
ccy	String	Conditional	Margin currency
Only applicable to cross MARGIN. It will return borrowing amount for Multi-currency margin and Portfolio margin when ccy takes effect.
tier	String	No	Tiers
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
    {
            "baseMaxLoan": "50",
            "imr": "0.1",
            "instId": "BTC-USDT",
            "maxLever": "10",
            "maxSz": "50",
            "minSz": "0",
            "mmr": "0.03",
            "optMgnFactor": "0",
            "quoteMaxLoan": "500000",
            "tier": "1",
            "uly": "",
            "instFamily": ""
        }
  ]
}
Response Parameters
Parameter	Type	Description
uly	String	Underlying
Applicable to FUTURES/SWAP/OPTION
instFamily	String	Instrument family
Applicable to FUTURES/SWAP/OPTION
instId	String	Instrument ID
tier	String	Tiers
minSz	String	The minimum borrowing amount or position of this gear is only applicable to margin/options/perpetual/delivery, the minimum position is 0 by default
It will return the minimum borrowing amount when ccy takes effect.
maxSz	String	The maximum borrowing amount or number of positions held in this position is only applicable to margin/options/perpetual/delivery
It will return the maximum borrowing amount when ccy takes effect.
mmr	String	Position maintenance margin requirement rate
imr	String	Initial margin requirement rate
maxLever	String	Maximum available leverage
optMgnFactor	String	Option Margin Coefficient (only applicable to options)
quoteMaxLoan	String	Quote currency borrowing amount (only applicable to leverage and the case when instId takes effect)
baseMaxLoan	String	Base currency borrowing amount (only applicable to leverage and the case when instId takes effect)
Get interest rate and loan quota (private)
This is a private endpoint and authentication is required for access.

Retrieve interest rate and loan quota for the site of the user.

Rate Limit: 2 requests per 2 seconds
Rate limit rule: User ID
HTTP Request
GET /api/v5/account/interest-rate-loan-quota

Request Example

GET /api/v5/account/interest-rate-loan-quota
Response Example

{
    "code": "0",
    "data": [
        {   
            "configCcyList": [
                {
                    "ccy": "USDT",
                    "rate": "0.00043728",
                }
            ],
            "basic": [
                {
                    "ccy": "USDT",
                    "quota": "500000",
                    "rate": "0.00043728"
                },
                {
                    "ccy": "BTC",
                    "quota": "10",
                    "rate": "0.00019992"
                }
            ],
            "vip": [
                {
                    "irDiscount": "",
                    "loanQuotaCoef": "6",
                    "level": "VIP1"
                },
                {
                    "irDiscount": "",
                    "loanQuotaCoef": "7",
                    "level": "VIP2"
                }
            ],
            "config": [
                {
                    "ccy": "USDT",
                    "stgyType": "0",    // normal
                    "quota": "xxxxxx",
                    "level": "VIP 8"
                },
                ......
                {
                    "ccy": "USDT",
                    "stgyType": "1",    // delta neutral
                    "quota": "xxxxx",
                    "level": "VIP 1"
                },
                ......
            ],
            "regular": [
                {
                    "irDiscount": "",
                    "loanQuotaCoef": "1",
                    "level": "Lv1"
                },
                {
                    "irDiscount": "",
                    "loanQuotaCoef": "2",
                    "level": "Lv1"
                }
            ]
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
basic	Array of objects	Basic interest rate
> ccy	String	Currency
> rate	String	Daily borrowing rate
> quota	String	Max borrow
vip	Array of objects	Interest info for vip users
> level	String	VIP Level, e.g. VIP1
> loanQuotaCoef	String	Loan quota coefficient. Loan quota = quota * level
> irDiscount	String	Interest rate discount(Deprecated)
regular	Array of objects	Interest info for regular users
> level	String	Regular user Level, e.g. Lv1
> loanQuotaCoef	String	Loan quota coefficient. Loan quota = quota * level
> irDiscount	String	Interest rate discount(Deprecated)
configCcyList	Array of strings	Currencies that have loan quota configured using customized absolute value.
Users should refer to config to get the loan quota of a currency which is listed in configCcyList, instead of getting it from basic/vip/regular.
> ccy	String	Currency
> rate	String	Daily rate
config	Array of objects	The currency details of loan quota configured using customized absolute value
> ccy	String	Currency
> stgyType	String	Strategy type
0: general strategy
1: delta neutral strategy
If only 0 is returned for a currency, it means the loan quota is shared between accounts in general strategy and accounts in delta neutral strategy; if both 0/1 are returned for a currency, it means accounts in delta neutral strategy have separate loan quotas.
> quota	String	Loan quota in absolute value
> level	String	VIP level
Get underlying
Rate Limit: 20 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/public/underlying

Request Example

GET /api/v5/public/underlying?instType=FUTURES
Request Parameters
Parameter	Type	Required	Description
instType	String	Yes	Instrument type
SWAP
FUTURES
OPTION
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
        [
            "LTC-USDT",
            "BTC-USDT",
            "ETC-USDT"
        ]
    ]
}
Response Parameters
Parameter	Type	Description
uly	Array	Underlying
Get security fund
Get security fund balance information

Rate Limit: 10 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/public/insurance-fund

Request Example

GET /api/v5/public/insurance-fund?instType=SWAP&uly=BTC-USD
Request Parameters
Parameter	Type	Required	Description
instType	String	Yes	Instrument type
MARGIN
SWAP
FUTURES
OPTION
type	String	No	Type
regular_update
liquidation_balance_deposit
bankruptcy_loss
platform_revenue
adl: ADL historical data
The default is all type
instFamily	String	Conditional	Instrument family
Required for FUTURES/SWAP/OPTION
ccy	String	Conditional	Currency, only applicable to MARGIN
before	String	No	Pagination of data to return records newer than the requested ts
after	String	No	Pagination of data to return records earlier than the requested ts
limit	String	No	Number of results per request. The maximum is 100; The default is 100
Response Example

{
    "code": "0",
    "data": [
        {
            "details": [
                {
                    "adlType": "",
                    "amt": "",
                    "balance": "1343.1308",
                    "ccy": "ETH",
                    "maxBal": "",
                    "maxBalTs": "",
                    "ts": "1704883083000",
                    "type": "regular_update"
                }
            ],
            "instFamily": "ETH-USD",
            "instType": "OPTION",
            "total": "1369179138.7489"
        }
    ],
    "msg": ""
}
Response Parameters
Parameter	Type	Description
total	String	The total balance of security fund, in USD
instFamily	String	Instrument family
Applicable to FUTURES/SWAP/OPTION
instType	String	Instrument type
details	Array of objects	security fund data
> balance	String	The balance of security fund
> amt	String	The change in the balance of security fund
Applicable when type is liquidation_balance_deposit, bankruptcy_loss or platform_revenue
> ccy	String	The currency of security fund
> type	String	The type of security fund
> maxBal	String	Maximum security fund balance in the past eight hours
Only applicable when type is adl
> maxBalTs	String	Timestamp when security fund balance reached maximum in the past eight hours, Unix timestamp format in milliseconds, e.g. 1597026383085
Only applicable when type is adl
> decRate	String	Real-time security fund decline rate (compare balance and maxBal)
Only applicable when type is adl(Deprecated)
> adlType	String	ADL related events
rate_adl_start: ADL begins due to high security fund decline rate
bal_adl_start: ADL begins due to security fund balance falling
pos_adl_start：ADL begins due to the volume of liquidation orders falls to a certain level (only applicable to premarket symbols)
adl_end: ADL ends
Only applicable when type is adl
> ts	String	The update timestamp of security fund. Unix timestamp format in milliseconds, e.g. 1597026383085
 The enumeration value `regular_update` of type field is used to present up-to-minute security fund change. The amt field will be used to present the difference of security fund balance when the type field is `liquidation_balance_deposit`, `bankruptcy_loss` or `platform_revenue`, which is generated once per day around 08:00 am (UTC). When type is `regular_update`, the amt field will be returned as "".
Get index tickers
Retrieve index tickers.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/market/index-tickers

Request Example

GET /api/v5/market/index-tickers?instId=BTC-USDT
Request Parameters
Parameter	Type	Required	Description
quoteCcy	String	Conditional	Quote currency
Currently there is only an index with USD/USDT/BTC/USDC as the quote currency.
instId	String	Conditional	Index, e.g. BTC-USD
Either quoteCcy or instId is required.
Same as uly.
Response Example

{
    "code": "0",
    "msg": "",
    "data": [
        {
            "instId": "BTC-USDT",
            "idxPx": "43350",
            "high24h": "43649.7",
            "sodUtc0": "43444.1",
            "open24h": "43640.8",
            "low24h": "43261.9",
            "sodUtc8": "43328.7",
            "ts": "1649419644492"
        }
    ]
}
Response Parameters
Parameter	Type	Description
instId	String	Index
idxPx	String	Latest index price
high24h	String	Highest price in the past 24 hours
low24h	String	Lowest price in the past 24 hours
open24h	String	Open price in the past 24 hours
sodUtc0	String	Open price in the UTC 0
sodUtc8	String	Open price in the UTC 8
ts	String	Index price update time, Unix timestamp format in milliseconds, e.g. 1597026383085
Get index candlesticks
Retrieve the candlestick charts of the index. This endpoint can retrieve the latest 1,440 data entries. Charts are returned in groups based on the requested bar.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/market/index-candles

Request Example

GET /api/v5/market/index-candles?instId=BTC-USD
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Index, e.g. BTC-USD
Same as uly.
after	String	No	Pagination of data to return records earlier than the requested ts
before	String	No	Pagination of data to return records newer than the requested ts. The latest data will be returned when using before individually
bar	String	No	Bar size, the default is 1m
e.g. [1m/3m/5m/15m/30m/1H/2H/4H]
UTC+8 opening price k-line: [6H/12H/1D/1W/1M/3M]
UTC+0 opening price k-line: [6Hutc/12Hutc/1Dutc/1Wutc/1Mutc/3Mutc]
limit	String	No	Number of results per request. The maximum is 100. The default is 100
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
     [
        "1597026383085",
        "3.721",
        "3.743",
        "3.677",
        "3.708",
        "0"
    ],
    [
        "1597026383085",
        "3.731",
        "3.799",
        "3.494",
        "3.72",
        "1"
    ]
    ]
}
Response Parameters
Parameter	Type	Description
ts	String	Opening time of the candlestick, Unix timestamp format in milliseconds, e.g. 1597026383085
o	String	Open price
h	String	highest price
l	String	Lowest price
c	String	Close price
confirm	String	The state of candlesticks.
0 represents that it is uncompleted, 1 represents that it is completed.
The candlestick data may be incomplete, and should not be polled repeatedly.

The data returned will be arranged in an array like this: [ts,o,h,l,c,confirm].

Get index candlesticks history
Retrieve the candlestick charts of the index from recent years.

Rate Limit: 10 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/market/history-index-candles

Request Example

GET /api/v5/market/history-index-candles?instId=BTC-USD
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Index, e.g. BTC-USD
Same as uly.
after	String	No	Pagination of data to return records earlier than the requested ts
before	String	No	Pagination of data to return records newer than the requested ts. The latest data will be returned when using before individually
bar	String	No	Bar size, the default is 1m
e.g. [1m/3m/5m/15m/30m/1H/2H/4H]
UTC+8 opening price k-line: [6H/12H/1D/1W/1M]
UTC+0 opening price k-line: [/6Hutc/12Hutc/1Dutc/1Wutc/1Mutc]
limit	String	No	Number of results per request. The maximum is 100; The default is 100
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
     [
        "1597026383085",
        "3.721",
        "3.743",
        "3.677",
        "3.708",
        "1"
    ],
    [
        "1597026383085",
        "3.731",
        "3.799",
        "3.494",
        "3.72",
        "1"
    ]
    ]
}
Response Parameters
Parameter	Type	Description
ts	String	Opening time of the candlestick, Unix timestamp format in milliseconds, e.g. 1597026383085
o	String	Open price
h	String	highest price
l	String	Lowest price
c	String	Close price
confirm	String	The state of candlesticks.
0 represents that it is uncompleted, 1 represents that it is completed.
The data returned will be arranged in an array like this: [ts,o,h,l,c,confirm].

Get mark price candlesticks
Retrieve the candlestick charts of mark price. This endpoint can retrieve the latest 1,440 data entries. Charts are returned in groups based on the requested bar.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/market/mark-price-candles

Request Example

GET /api/v5/market/mark-price-candles?instId=BTC-USD-SWAP
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USD-SWAP
after	String	No	Pagination of data to return records earlier than the requested ts
before	String	No	Pagination of data to return records newer than the requested ts. The latest data will be returned when using before individually
bar	String	No	Bar size, the default is 1m
e.g. [1m/3m/5m/15m/30m/1H/2H/4H]
UTC+8 opening price k-line: [6H/12H/1D/1W/1M/3M]
UTC+0 opening price k-line: [6Hutc/12Hutc/1Dutc/1Wutc/1Mutc/3Mutc]
limit	String	No	Number of results per request. The maximum is 100; The default is 100
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
     [
        "1597026383085",
        "3.721",
        "3.743",
        "3.677",
        "3.708",
        "0"
    ],
    [
        "1597026383085",
        "3.731",
        "3.799",
        "3.494",
        "3.72",
        "1"
    ]
    ]
}
Response Parameters
Parameter	Type	Description
ts	String	Opening time of the candlestick, Unix timestamp format in milliseconds, e.g. 1597026383085
o	String	Open price
h	String	highest price
l	String	Lowest price
c	String	Close price
confirm	String	The state of candlesticks.
0 represents that it is uncompleted, 1 represents that it is completed.
The candlestick data may be incomplete, and should not be polled repeatedly.

The data returned will be arranged in an array like this: [ts,o,h,l,c,confirm]

Get mark price candlesticks history
Retrieve the candlestick charts of mark price from recent years.

Rate Limit: 20 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/market/history-mark-price-candles

Request Example

GET /api/v5/market/history-mark-price-candles?instId=BTC-USD-SWAP
Request Parameters
Parameter	Type	Required	Description
instId	String	Yes	Instrument ID, e.g. BTC-USD-SWAP
after	String	No	Pagination of data to return records earlier than the requested ts
before	String	No	Pagination of data to return records newer than the requested ts. The latest data will be returned when using before individually
bar	String	No	Bar size, the default is 1m
e.g. [1m/3m/5m/15m/30m/1H/2H/4H]
UTC+8 opening price k-line: [6H/12H/1D/1W/1M]
UTC+0 opening price k-line: [6Hutc/12Hutc/1Dutc/1Wutc/1Mutc]
limit	String	No	Number of results per request. The maximum is 100; The default is 100
Response Example

{
    "code":"0",
    "msg":"",
    "data":[
     [
        "1597026383085",
        "3.721",
        "3.743",
        "3.677",
        "3.708",
        "1"
    ],
    [
        "1597026383085",
        "3.731",
        "3.799",
        "3.494",
        "3.72",
        "1"
    ]
    ]
}
Response Parameters
Parameter	Type	Description
ts	String	Opening time of the candlestick, Unix timestamp format in milliseconds, e.g. 1597026383085
o	String	Open price
h	String	highest price
l	String	Lowest price
c	String	Close price
confirm	String	The state of candlesticks.
0 represents that it is uncompleted, 1 represents that it is completed.
The data returned will be arranged in an array like this: [ts,o,h,l,c,confirm]

Get index components
Get the index component information data on the market

Rate Limit: 20 requests per 2 seconds
Rate limit rule: IP
HTTP Request
GET /api/v5/market/index-components

Request Example

GET /api/v5/market/index-components?index=BTC-USD
Request Parameters
Parameter	Type	Required	Description
index	String	Yes	index, e.g BTC-USDT
Same as uly.
Response Example

{
    "code": "0",
    "msg": "",
    "data": {
        "components": [
            {
                "symbol": "BTC/USDT",
                "symPx": "52733.2",
                "wgt": "0.25",
                "cnvPx": "52733.2",
                "exch": "OKX"
            },
            {
                "symbol": "BTC/USDT",
                "symPx": "52739.87000000",
                "wgt": "0.25",
                "cnvPx": "52739.87000000",
                "exch": "Binance"
            },
            {
                "symbol": "BTC/USDT",
                "symPx": "52729.1",
                "wgt": "0.25",
                "cnvPx": "52729.1",
                "exch": "Huobi"
            },
            {
                "symbol": "BTC/USDT",
                "symPx": "52739.47929397",
                "wgt": "0.25",
                "cnvPx": "52739.47929397",
                "exch": "Poloniex"
            }
        ],
        "last": "52735.4123234925",
        "index": "BTC-USDT",
        "ts": "1630985335599"
    }
}
Response Parameters
Parameter	Type	Description
index	String	Index
last	String	Latest Index Price
ts	String	Data generation time, Unix timestamp format in milliseconds, e.g. 1597026383085
components	Array of objects	Components
> exch	String	Name of Exchange
> symbol	String	Name of Exchange Trading Pairs
> symPx	String	Price of Exchange Trading Pairs
> wgt	String	Weights
> cnvPx	String	Price converted to index
WebSocket
Instruments channel
The triggering scenarios for incremental data are:
1. When there is any change to the instrument’s state (such as delivery of FUTURES, exercise of OPTION, listing of new contracts / trading pairs, trading suspension, etc.)
2. When the trading parameters change (tickSz,minSz,maxMktSz)
3. When the expTime or listTime changes

URL Path
/ws/v5/public

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "instruments",
      "instType": "SPOT"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
instruments
> instType	String	Yes	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "instruments",
    "instType": "SPOT"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"instruments\", \"instType\" : \"FUTURES\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instType	String	Yes	Instrument type
SPOT
MARGIN
SWAP
FUTURES
OPTION
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
  "arg": {
    "channel": "instruments",
    "instType": "SPOT"
  },
  "data": [
    {
        "alias": "",
        "auctionEndTime": "",
        "baseCcy": "BTC",
        "category": "1",
        "ctMult": "",
        "ctType": "",
        "ctVal": "",
        "ctValCcy": "",
        "contTdSwTime": "1704876947000",
        "expTime": "",
        "futureSettlement": false,
        "groupId": "1",
        "instFamily": "",
        "instId": "BTC-USDT",
        "instType": "SPOT",
        "lever": "10",
        "listTime": "1606468572000",
        "lotSz": "0.00000001",
        "maxIcebergSz": "9999999999.0000000000000000",
        "maxLmtAmt": "1000000",
        "maxLmtSz": "9999999999",
        "maxMktAmt": "1000000",
        "maxMktSz": "",
        "maxStopSz": "",
        "maxTriggerSz": "9999999999.0000000000000000",
        "maxTwapSz": "9999999999.0000000000000000",
        "minSz": "0.00001",
        "optType": "",
        "openType": "call_auction",
        "preMktSwTime": "",
        "quoteCcy": "USDT",
        "settleCcy": "",
        "state": "live",
        "ruleType": "normal",
        "stk": "",
        "tickSz": "0.1",
        "uly": "",
        "instIdCode": 1000000000,
        "instCategory": "1",
        "upcChg": [
            {
                "param": "tickSz",
                "newValue": "0.0001",
                "effTime": "1704876947000"
            }
        ]
    }
  ]
}
Push data parameters
Parameter	Type	Description
arg	Object	Subscribed channel
> channel	String	Channel name
> instType	String	Instrument type
data	Array of objects	Subscribed data
> instType	String	Instrument type
> instId	String	Instrument ID, e.g. BTC-UST
> uly	String	Underlying, e.g. BTC-USD
Only applicable to FUTURES/SWAP/OPTION
> groupId	String	Instrument trading fee group ID
Spot:
1: Spot USDT
2: Spot USDC & Crypto
3: Spot TRY
4: Spot EUR
5: Spot BRL
7: Spot AED
8: Spot AUD
9: Spot USD
10: Spot SGD
11: Spot zero
12: Spot group one
13: Spot group two
14: Spot group three
15: Spot special rule

Expiry futures:
1: Expiry futures crypto-margined
2: Expiry futures USDT-margined
3: Expiry futures USDC-margined
4: Expiry futures premarket
5: Expiry futures group one
6: Expiry futures group two

Perpetual futures:
1: Perpetual futures crypto-margined
2: Perpetual futures USDT-margined
3: Perpetual futures USDC-margined
4: Perpetual futures group one
5: Perpetual futures group two
6: Stock perpetual futures

Options:
1: Options crypto-margined
2: Options USDC-margined

instType and groupId should be used together to determine a trading fee group. Users should use this endpoint together with fee rates endpoint to get the trading fee of a specific symbol.

Some enum values may not apply to you; the actual return values shall prevail.
> instFamily	String	Instrument family, e.g. BTC-USD
Only applicable to FUTURES/SWAP/OPTION
> category	String	Currency category. Note: this parameter is already deprecated
> baseCcy	String	Base currency, e.g. BTC in BTC-USDT
Only applicable to SPOT/MARGIN
> quoteCcy	String	Quote currency, e.g. USDT in BTC-USDT
Only applicable to SPOT/MARGIN
> settleCcy	String	Settlement and margin currency, e.g. BTC
Only applicable to FUTURES/SWAP/OPTION
> ctVal	String	Contract value
> ctMult	String	Contract multiplier
> ctValCcy	String	Contract value currency
> optType	String	Option type
C: Call
P: Put
Only applicable to OPTION
> stk	String	Strike price
Only applicable to OPTION
> listTime	String	Listing time
Only applicable to FUTURES/SWAP/OPTION
> auctionEndTime	String	The end time of call auction, Unix timestamp format in milliseconds, e.g. 1597026383085
Only applicable to SPOT that are listed through call auctions, return "" in other cases (deprecated, use contTdSwTime)
> contTdSwTime	String	Continuous trading switch time. The switch time from call auction, prequote to continuous trading, Unix timestamp format in milliseconds. e.g. 1597026383085.
Only applicable to SPOT/MARGIN that are listed through call auction or prequote, return "" in other cases.
> preMktSwTime	String	The time premarket swap switched to normal swap, Unix timestamp format in milliseconds, e.g. 1597026383085.
Only applicable premarket SWAP
> openType	String	Open type
fix_price: fix price opening
pre_quote: pre-quote
call_auction: call auction
Only applicable to SPOT/MARGIN, return "" for all other business lines
> expTime	String	Expiry time
Applicable to SPOT/MARGIN/FUTURES/SWAP/OPTION. For FUTURES/OPTION, it is the delivery/exercise time. It can also be the delisting time of the trading instrument. Update once change.
> lever	String	Max Leverage
Not applicable to SPOT/OPTION, used to distinguish between MARGIN and SPOT.
> tickSz	String	Tick size, e.g. 0.0001
For Option, it is minimum tickSz among tick band.
> lotSz	String	Lot size
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency
> minSz	String	Minimum order size
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency
> ctType	String	Contract type
linear: linear contract
inverse: inverse contract
Only applicable to FUTURES/SWAP
> alias	String	Contract alias (deprecated — use expTime to obtain the delivery time, will be removed by the end of April 2026)
this_week
next_week
this_month
next_month
quarter
next_quarter
this_five_years: current 5-year contract
next_five_years: next 5-year contract
Only applicable to FUTURES
> state	String	Instrument status
live
suspend
expired
rebase: can't be traded during rebasing, only applicable to SWAP
preopen. e.g. There will be preopen before the Futures and Options new contracts state is live.
test: Test pairs, can't be traded
> ruleType	String	Trading rule types
normal: normal trading
pre_market: pre-market trading
rebase_contract: pre-market rebase contract
xperp: perpetual-style futures, only applicable to certain FUTURES contracts
> maxLmtSz	String	The maximum order quantity of a single limit order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
> maxMktSz	String	The maximum order quantity of a single market order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in USDT.
> maxTwapSz	String	The maximum order quantity of a single TWAP order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
> maxIcebergSz	String	The maximum order quantity of a single iceBerg order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
> maxTriggerSz	String	The maximum order quantity of a single trigger order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in base currency.
> maxStopSz	String	The maximum order quantity of a single stop market order.
If it is a derivatives contract, the value is the number of contracts.
If it is SPOT/MARGIN, the value is the quantity in USDT.
> futureSettlement	Boolean	Whether daily settlement for expiry feature is enabled
Applicable to FUTURES cross
> instIdCode	Integer	Instrument ID code.
For simple binary encoding, you must use instIdCode instead of instId.
For the same instId, it's value may be different between production and demo trading.
It is null when the value is not generated.
> instCategory	String	The asset category of the instrument’s base asset (the first segment of the instrument ID). For example, for BTC-USDT-SWAP, the instCategory represents the asset category of BTC.
1: Crypto
3: Stocks
4: Commodities
5: Forex
6: Bonds
"": Not available
> upcChg	Array of objects	Upcoming changes. It is [] when there is no upcoming change.
>> param	String	The parameter name to be updated.
tickSz
minSz
maxMktSz
>> newValue	String	The parameter value that will replace the current one.
>> effTime	String	Effective time. Unix timestamp format in milliseconds, e.g. 1597026383085
 Instrument status will trigger pushing of incremental data from instruments channel. When a new contract is going to be listed, the instrument data of the new contract will be available with status preopen. When a product is going to be delisted (e.g. when a FUTURES contract is settled or OPTION contract is exercised), the instrument status will be changed to expired.
 listTime and contTdSwTime
For spot symbols listed through a call auction or pre-open, listTime represents the start time of the auction or pre-open, and contTdSwTime indicates the end of the auction or pre-open and the start of continuous trading. For other scenarios, listTime will mark the beginning of continuous trading, and contTdSwTime will return an empty value "".
 state
The state will always change from `preopen` to `live` when the listTime is reached. Certain symbols will now have `state:preopen` before they go live. Before going live, the instruments channel will push data for pre-listing symbols with `state:preopen`. If the listing is cancelled, the channel will send full data excluding the cancelled symbol, without additional notification. When the symbol goes live (reaching listTime), the channel will push data with `state:live`. Users can also query the corresponding data via the REST endpoint.
When a product is going to be delisted (e.g. when a FUTURES contract is settled or OPTION contract is exercised), the instrument will not be available.
Open interest channel
Retrieve the open interest. Data will be pushed every 3 seconds when there are updates.

URL Path
/ws/v5/public

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "open-interest",
      "instId": "LTC-USD-SWAP"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
open-interest
> instId	String	Yes	Instrument ID
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
      "channel": "open-interest",
      "instId": "LTC-USD-SWAP"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"open-interest\", \"instId\" : \"LTC-USD-SWAP\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instId	String	Yes	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
    "arg": {
        "channel": "open-interest",
        "instId": "BTC-USDT-SWAP"
    },
    "data": [
        {
            "instId": "BTC-USDT-SWAP",
            "instType": "SWAP",
            "oi": "2216113.01000000309",
            "oiCcy": "22161.1301000000309",
            "oiUsd": "1939251795.54769270396321",
            "ts": "1743041250440"
        }
    ]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> instId	String	Instrument ID
data	Array of objects	Subscribed data
> instType	String	Instrument type
> instId	String	Instrument ID, e.g. BTC-USDT-SWAP
> oi	String	Open interest, in units of contracts.
> oiCcy	String	Open interest, in currency units, like BTC.
> oiUsd	String	Open interest in number of USD
> ts	String	The time when the data was updated, Unix timestamp format in milliseconds, e.g. 1597026383085
Funding rate channel
Retrieve funding rate. Data will be pushed in 30s to 90s.

URL Path
/ws/v5/public

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "funding-rate",
      "instId": "BTC-USD-SWAP"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
funding-rate
> instId	String	Yes	Instrument ID
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "funding-rate",
    "instId": "BTC-USD-SWAP"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"funding-rate\", \"instId\" : \"BTC-USD-SWAP\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	yes	Channel name
> instId	String	No	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
   "arg":{
      "channel":"funding-rate",
      "instId":"BTC-USD-SWAP"
   },
   "data":[
      {
         "formulaType": "noRate",
         "fundingRate":"0.0001875391284828",
         "fundingTime":"1700726400000",
         "impactValue": "",
         "instId":"BTC-USD-SWAP",
         "instType":"SWAP",
         "interestRate": "",
         "method": "current_period",
         "maxFundingRate":"0.00375",
         "minFundingRate":"-0.00375",
         "nextFundingRate":"",
         "nextFundingTime":"1700755200000",
         "premium": "0.0001233824646391",
         "settFundingRate":"0.0001699799259033",
         "settState":"settled",
         "ts":"1700724675402"
      }
   ]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> instId	String	Instrument ID
data	Array of objects	Subscribed data
> instType	String	Instrument type
SWAP: Perpetual futures
FUTURES: X-Perps futures
> instId	String	Instrument ID, e.g. BTC-USD-SWAP
> method	String	Funding rate mechanism
current_period
next_period(no longer supported)
> formulaType	String	Formula type
noRate: old funding rate formula
withRate: new funding rate formula
> fundingRate	String	Current funding rate
> nextFundingRate	String	Forecasted funding rate for the next period
The nextFundingRate will be "" if the method is current_period(no longer supported)
> fundingTime	String	Settlement time, Unix timestamp format in milliseconds, e.g. 1597026383085
> nextFundingTime	String	Forecasted funding time for the next period, Unix timestamp format in milliseconds, e.g. 1597026383085
> minFundingRate	String	The lower limit of the predicted funding rate of the next cycle
> maxFundingRate	String	The upper limit of the predicted funding rate of the next cycle
> interestRate	String	Interest rate
> impactValue	String	Depth weighted amount (in the unit of quote currency)
> settState	String	Settlement state of funding rate
processing
settled
> settFundingRate	String	If settState = processing, it is the funding rate that is being used for current settlement cycle.
If settState = settled, it is the funding rate that is being used for previous settlement cycle
> premium	String	Premium index
formula: [Max (0, Impact bid price – Index price) – Max (0, Index price – Impact ask price)] / Index price
> ts	String	Data return time, Unix timestamp format in milliseconds, e.g. 1597026383085
 For some altcoins perpetual swaps with significant fluctuations in funding rates, OKX will closely monitor market changes. When necessary, the funding rate collection frequency, currently set at 8 hours, may be adjusted to higher frequencies such as 6 hours, 4 hours, 2 hours, or 1 hour. Thus, users should focus on the difference between `fundingTime` and `nextFundingTime` fields to determine the funding fee interval of a contract.
Price limit channel
Retrieve the maximum buy price and minimum sell price of instruments. Data will be pushed every 200ms when there are changes in limits, and will not be pushed when there is no changes on limit.

URL Path
/ws/v5/public

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "price-limit",
      "instId": "LTC-USD-190628"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
price-limit
> instId	String	Yes	Instrument ID
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "price-limit",
    "instId": "LTC-USD-190628"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"price-limit\", \"instId\" : \"LTC-USD-190628\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instId	String	Yes	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
    "arg": {
        "channel": "price-limit",
        "instId": "LTC-USD-190628"
    },
    "data": [{
        "instId": "LTC-USD-190628",
        "buyLmt": "200",
        "sellLmt": "300",
        "ts": "1597026383085",
        "enabled": true
    }]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> instId	String	Instrument ID
data	Array of objects	Subscribed data
> instType	String	Instrument type
> instId	String	Instrument ID, e.g. BTC-USDT
> buyLmt	String	Maximum buy price
Return "" when enabled is false
> sellLmt	String	Minimum sell price
Return "" when enabled is false
> ts	String	Price update time, Unix timestamp format in milliseconds, e.g. 1597026383085
> enabled	Boolean	Whether price limit is effective
true: the price limit is effective
false: the price limit is not effective
Estimated delivery/exercise/settlement price channel
Retrieve the estimated delivery/exercise/settlement price of FUTURES, OPTION and SWAP contracts.

The estimated price, calculated based on index price during the one-hour period prior to delivery, excerise, or settlement, with updates pushed approximately every 200ms.

URL Path
/ws/v5/public

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "estimated-price",
      "instType": "FUTURES",
      "instFamily": "BTC-USD"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
estimated-price
> instType	String	Yes	Instrument type
OPTION
FUTURES
SWAP
> instFamily	String	Conditional	Instrument family
Either instFamily or instId is required.
> instId	String	Conditional	Instrument ID
Either instFamily or instId is required.
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "estimated-price",
    "instType": "FUTURES",
    "instFamily": "BTC-USD"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"estimated-price\", \"instId\" : \"FUTURES\",\"uly\" :\"BTC-USD\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instType	String	Yes	Instrument type
OPTION
FUTURES
SWAP
> instFamily	String	Conditional	Instrument family
> instId	String	Conditional	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
    "arg": {
        "channel": "estimated-price",
        "instType": "FUTURES",
        "instFamily": "XRP-USDT"
    },
    "data": [{
        "instId": "XRP-USDT-250307",
        "instType": "FUTURES",
        "settlePx": "2.4230631578947368",
        "settleType": "settlement",
        "ts": "1741244598708"
    }]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> instType	String	Instrument type
FUTURES
OPTION
SWAP
> instFamily	String	Instrument family
> instId	String	Instrument ID
data	Array of objects	Subscribed data
> instType	String	Instrument type
> instId	String	Instrument ID, e.g. BTC-USD-170310
> settleType	String	Type
settlement: Futures settlement
delivery: Futures delivery
exercise: Option exercise
> settlePx	String	Estimated price
> ts	String	Data update time, Unix timestamp format in milliseconds, e.g. 1597026383085
Mark price channel
Retrieve the mark price. Data will be pushed every 200 ms when the mark price changes, and will be pushed every 10 seconds when the mark price does not change.

URL Path
/ws/v5/public

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "mark-price",
      "instId": "LTC-USD-190628"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
mark-price
> instId	String	Yes	Instrument ID
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "mark-price",
    "instId": "LTC-USD-190628"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"mark-price\", \"instId\" : \"LTC-USD-190628\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instId	String	No	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
  "arg": {
    "channel": "mark-price",
    "instId": "LTC-USD-190628"
  },
  "data": [
    {
      "instType": "FUTURES",
      "instId": "LTC-USD-190628",
      "markPx": "0.1",
      "ts": "1597026383085"
    }
  ]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> instId	String	Instrument ID
data	Array of objects	Subscribed data
> instType	String	Instrument type
> instId	String	Instrument ID
> markPx	String	Mark price
> ts	String	Price update time, Unix timestamp format in milliseconds, e.g. 1597026383085
Index tickers channel
Retrieve index tickers data. Push data every 100ms if there are any changes, otherwise push once a minute.

URL Path
/ws/v5/public

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "index-tickers",
      "instId": "BTC-USDT"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	subscribe unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
index-tickers
> instId	String	Yes	Index with USD, USDT, BTC, USDC as the quote currency, e.g. BTC-USDT
Same as uly.
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "index-tickers",
    "instId": "BTC-USDT"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"index-tickers\", \"instId\" : \"BTC-USDT\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	subscribe unsubscribe error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
index-tickers
> instId	String	Yes	Index with USD, USDT, BTC, USDC as the quote currency, e.g. BTC-USDT
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
  "arg": {
    "channel": "index-tickers",
    "instId": "BTC-USDT"
  },
  "data": [
    {
      "instId": "BTC-USDT",
      "idxPx": "0.1",
      "high24h": "0.5",
      "low24h": "0.1",
      "open24h": "0.1",
      "sodUtc0": "0.1",
      "sodUtc8": "0.1",
      "ts": "1597026383085"
    }
  ]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> instId	String	Index with USD, USDT, or BTC as quote currency, e.g. BTC-USDT.
data	Array of objects	Subscribed data
> instId	String	Index
> idxPx	String	Latest Index Price
> open24h	String	Open price in the past 24 hours
> high24h	String	Highest price in the past 24 hours
> low24h	String	Lowest price in the past 24 hours
> sodUtc0	String	Open price in the UTC 0
> sodUtc8	String	Open price in the UTC 8
> ts	String	Update time of the index ticker, Unix timestamp format in milliseconds, e.g. 1597026383085
Mark price candlesticks channel
Retrieve the candlesticks data of the mark price. The push frequency is the fastest interval 1 second push the data.

URL Path
/ws/v5/business

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "mark-price-candle1D",
      "instId": "BTC-USD-190628"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
mark-price-candle3M
mark-price-candle1M
mark-price-candle1W
mark-price-candle1D
mark-price-candle2D
mark-price-candle3D
mark-price-candle5D
mark-price-candle12H
mark-price-candle6H
mark-price-candle4H
mark-price-candle2H
mark-price-candle1H
mark-price-candle30m
mark-price-candle15m
mark-price-candle5m
mark-price-candle3m
mark-price-candle1m
mark-price-candle1Yutc
mark-price-candle3Mutc
mark-price-candle1Mutc
mark-price-candle1Wutc
mark-price-candle1Dutc
mark-price-candle2Dutc
mark-price-candle3Dutc
mark-price-candle5Dutc
mark-price-candle12Hutc
mark-price-candle6Hutc
> instId	String	Yes	Instrument ID
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "mark-price-candle1D",
    "instId": "BTC-USD-190628"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"mark-price-candle1D\", \"instId\" : \"BTC-USD-190628\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instId	String	Yes	Instrument ID
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
  "arg": {
    "channel": "mark-price-candle1D",
    "instId": "BTC-USD-190628"
  },
  "data": [
    ["1597026383085", "3.721", "3.743", "3.677", "3.708","0"],
    ["1597026383085", "3.731", "3.799", "3.494", "3.72","1"]
  ]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> instId	String	Instrument ID
data	Array of Arrays	Subscribed data
> ts	String	Opening time of the candlestick, Unix timestamp format in milliseconds, e.g. 1597026383085
> o	String	Open price
> h	String	Highest price
> l	String	Lowest price
> c	String	Close price
> confirm	String	The state of candlesticks.
0 represents that it is uncompleted, 1 represents that it is completed.
Index candlesticks channel
Retrieve the candlesticks data of the index. The push frequency is the fastest interval 1 second push the data. .

URL Path
/ws/v5/business

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "index-candle30m",
      "instId": "BTC-USD"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
index-candle3M
index-candle1M
index-candle1W
index-candle1D
index-candle2D
index-candle3D
index-candle5D
index-candle12H
index-candle6H
index-candle4H
index -candle2H
index-candle1H
index-candle30m
index-candle15m
index-candle5m
index-candle3m
index-candle1m
index-candle3Mutc
index-candle1Mutc
index-candle1Wutc
index-candle1Dutc
index-candle2Dutc
index-candle3Dutc
index-candle5Dutc
index-candle12Hutc
index-candle6Hutc
> instId	String	Yes	Index, e.g. BTC-USD
Same as uly.
Successful Response Example

{
  "id": "1512",
  "event": "subscribe",
  "arg": {
    "channel": "index-candle30m",
    "instId": "BTC-USD"
  },
  "connId": "a4d3ae55"
}
Failure Response Example

{
  "id": "1512",
  "event": "error",
  "code": "60012",
  "msg": "Invalid request: {\"op\": \"subscribe\", \"argss\":[{ \"channel\" : \"index-candle30m\", \"instId\" : \"BTC-USD\"}]}",
  "connId": "a4d3ae55"
}
Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	subscribe unsubscribe
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
> instId	String	No	Index, e.g. BTC-USD
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
  "arg": {
    "channel": "index-candle30m",
    "instId": "BTC-USD"
  },
  "data": [["1597026383085", "3811.31", "3811.31", "3811.31", "3811.31", "0"]]
}
Push data parameters
Parameter	Type	Description
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> instId	String	Index
data	Array of Arrays	Subscribed data
> ts	String	Opening time of the candlestick, Unix timestamp format in milliseconds, e.g. 1597026383085
> o	String	Open price
> h	String	Highest price
> l	String	Lowest price
> c	String	Close price
> confirm	String	The state of candlesticks.
0 represents that it is uncompleted, 1 represents that it is completed.
 The order of the returned values is: [ts,o,h,l,c,confirm]
Liquidation orders channel
Retrieve the recent liquidation orders. This data doesn’t represent the total number of liquidations on OKX.

URL Path
/ws/v5/public

Request Example

{
  "id": "1512",
  "op": "subscribe",
  "args": [
    {
      "channel": "liquidation-orders",
      "instType": "SWAP"
    }
  ]
}
Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
liquidation-orders
> instType	String	Yes	Instrument type
SWAP
FUTURES
MARGIN
OPTION
Response Example

{
    "id": "1512",
    "arg": {
        "channel": "liquidation-orders",
        "instType": "SWAP"
    },
    "data": [
        {
            "details": [
                {
                    "bkLoss": "0",
                    "bkPx": "0.007831",
                    "ccy": "",
                    "posSide": "short",
                    "side": "buy",
                    "sz": "13",
                    "ts": "1692266434010"
                }
            ],
            "instFamily": "IOST-USDT",
            "instId": "IOST-USDT-SWAP",
            "instType": "SWAP",
            "uly": "IOST-USDT"
        }
    ]
}
Response Parameters
Parameter	Type	Description
id	String	Unique identifier of the message
arg	Object	Successfully subscribed channel
> channel	String	Channel name
> instId	String	Instrument ID
data	Array of objects	Subscribed data
> instType	String	Instrument type
> instId	String	Instrument ID, e.g. BTC-USD-SWAP
> uly	String	Underlying
Applicable to FUTURES/SWAP/OPTION
> details	Array of objects	Liquidation details
>> side	String	Order side
buy
sell
Applicable to FUTURES/SWAP
>> posSide	String	Position mode side
long: Hedge mode long
short: Hedge mode short
net: Net mode
>> bkPx	String	Bankruptcy price. The price of the transaction with the system's liquidation account, only applicable to FUTURES/SWAP
>> sz	String	Quantity of liquidation, only applicable to MARGIN/FUTURES/SWAP.
For MARGIN, the unit is base currency.
For FUTURES/SWAP, the unit is contract.
>> bkLoss	String	Bankruptcy loss
>> ccy	String	Liquidation currency, only applicable to MARGIN
>> ts	String	Liquidation time, Unix timestamp format in milliseconds, e.g. 1597026383085
 Liquidation data comes from different data sources, so the updated data is not necessarily in chronological order.
ADL warning channel
Auto-deleveraging warning channel.

In the normal state, data will be pushed once every minute to display the balance of security fund and etc.

In the warning state or when there is ADL risk (warning/adl), data will be pushed every second to display information such as the real-time decline rate of security fund.

For more ADL details, please refer to Introduction to Auto-deleveraging

URL Path
/ws/v5/public

Request Example

{
    "id": "1512",
    "op": "subscribe",
    "args": [{
        "channel": "adl-warning",
        "instType": "FUTURES",
        "instFamily": "BTC-USDT"
    }]
}

Request Parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
Provided by client. It will be returned in response message for identifying the corresponding request.
A combination of case-sensitive alphanumerics, all numbers, or all letters of up to 32 characters.
op	String	Yes	Operation
subscribe
unsubscribe
args	Array of objects	Yes	List of subscribed channels
> channel	String	Yes	Channel name
adl-warning
> instType	String	Yes	Instrument type
SWAP
FUTURES
OPTION
> instFamily	String	No	Instrument family
Successful Response Example

{
   "id": "1512",
   "event":"subscribe",
   "arg":{
      "channel":"adl-warning",
      "instType":"FUTURES",
      "instFamily":"BTC-USDT"
   },
   "connId":"48d8960a"
}

Failure Response Example

{
   "id": "1512",
   "event":"error",
   "msg":"Illegal request: { \"event\": \"subscribe\", \"arg\": { \"channel\": \"adl-warning\", \"instType\": \"FUTURES\", \"instFamily\": \"BTC-USDT\" } }",
   "code":"60012",
   "connId":"48d8960a"
}

Response parameters
Parameter	Type	Required	Description
id	String	No	Unique identifier of the message
event	String	Yes	Event
subscribe
unsubscribe
error
arg	Object	No	Subscribed channel
> channel	String	Yes	Channel name
adl-warning
> instType	String	Yes	Instrument type
> instFamily	String	No	Instrument family
code	String	No	Error code
msg	String	No	Error message
connId	String	Yes	WebSocket connection ID
Push Data Example

{
   "arg":{
      "channel":"adl-warning",
      "instType":"FUTURES",
      "instFamily":"BTC-USDT"
   },
   "data":[
      {
         "maxBal":"",
         "adlRecBal":"8000.0",
         "bal":"280784384.9564228289548144",
         "instType":"FUTURES",
         "ccy": "USDT",
         "instFamily":"BTC-USDT",
         "maxBalTs":"",
         "adlType":"",
         "state":"normal",
         "adlBal":"0",
         "ts":"1700210763001"
      }
   ]
}

Push data parameters
Parameter	Type	Description
arg	Object	Subscribed channel
> channel	String	Channel name
adl-warning
> instType	String	Instrument type
> instFamily	String	Instrument family
data	Array of objects	Subscribed data
> instType	String	Instrument type
> instFamily	String	Instrument family
> state	String	state
normal
warning
adl
> bal	String	Real-time security fund balance
> ccy	String	The corresponding currency of security fund balance
> maxBal	String	Maximum security fund balance in the past eight hours

Applicable when state is warning or adl
> maxBalTs	String	Timestamp when security fund balance reached maximum in the past eight hours, Unix timestamp format in milliseconds, e.g. 1597026383085
> adlType	String	ADL related events
rate_adl_start: ADL begins due to high security fund decline rate
bal_adl_start: ADL begins due to security fund balance falling
pos_adl_start：ADL begins due to the volume of liquidation orders falls to a certain level (only applicable to premarket symbols)
adl_end: ADL ends
> adlBal	String	security fund balance that triggers ADL
> adlRecBal	String	security fund balance that turns off ADL
> ts	String	Data push time, Unix timestamp format in milliseconds, e.g. 1597026383085
> decRate	String	Real-time security fund decline rate (compare bal and maxBal)

Applicable when state is warning or adl(Deprecated)
> adlRate	String	security fund decline rate that triggers ADL(Deprecated)
> adlRecRate	String	security fund decline rate that turns off ADL(Deprecated)

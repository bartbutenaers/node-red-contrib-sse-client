# node-red-contrib-sse-client
Node-Red node to receive Server-Sent-Events.

## Install
Run the following npm command in your Node-RED user directory (typically ~/.node-red):
```
npm install node-red-contrib-sse-client
```

## SSE basics
Server-Sent Events allow a client (e.g. a web page in a browser) to get *automatically* data updates from a server.

![Communication](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-sse-client/master/images/sse_communication.png)

This SSE client node sends a single http request to the SSE server, and subscribes for one or more ***events*** at the server.  As soon as one of those events occur at the SSE server, the server will send the data of the event to this client.  This way data streaming is accomplished...

The example flow below is based on this [demo SSE stream](https://proxy.streamdata.io/http://stockmarket.streamdata.io/prices/).  By opening the stream with a browser (e.g. Chrome), the content of the stream will be displayed:

```
id:2c6e7f72-3c15-4f6d-b2dc-927611d60a28
event:data
data:[{"title":"Value 0","price":40,"param1":"value1","param2":"value2","param3":"value3","param4":"value4","param5":"value5","param6":"value6","param7":"value7","param8":"value8"},{"title":"Value 1","price":36,"param1":"value1","param2":"value2","param3":"value3","param4":"value4","param5":"value5","param6":"value6","param7":"value7","param8":"value8"},{"title":"Value 2","price":33,"param1":"value1","param2":"value2","param3":"value3","param4":"value4","param5":"value5","param6":"value6","param7":"value7","param8":"value8"}]

id:275e89c5-fdb0-46d4-9c27-7efcaa5ab077
event:patch
data:[{"op":"replace","path":"/8/price","value":82}]

id:f91c7af4-3119-4748-af80-219f0e807d68
event:patch
data:[{"op":"replace","path":"/0/price","value":67},{"op":"replace","path":"/1/price","value":89},{"op":"replace","path":"/2/price","value":45},{"op":"replace","path":"/3/price","value":64},{"op":"replace","path":"/5/price","value":19},{"op":"replace","path":"/8/price","value":68}]
```

In this example stream, the available events are *'data'* and *'patch'*.  Those event names need to be specified in the node's config screen, to be able to receive them.  

P.S. If you are wondering whether your data stream is an SSE stream (or perhaps some other streaming type), have a look at the **'content-type'** of the http response.  In case of SSE streaming, the content-type should contain **'event-stream'**.  For example in Chrome this can be visualised in the Developer Tools (Network tab):

![ContentType](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-sse-client/master/images/sse_contenttype.png)

## Node Usage
The following example flow explains how this node works:

![Flow](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-sse-client/master/images/sse_flow.png)

```
[{"id":"4b3e05d.624d1fc","type":"inject","z":"279b8956.27dfe6","name":"Start stream","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":290,"y":420,"wires":[["54856b75.8323f4"]]},{"id":"90998fcb.a12cf","type":"inject","z":"279b8956.27dfe6","name":"Pause stream","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":290,"y":500,"wires":[["cc7381a4.13aae"]]},{"id":"5dea869b.8d96f8","type":"debug","z":"279b8956.27dfe6","name":"Display event","active":true,"tosidebar":true,"console":false,"tostatus":false,"complete":"payload","x":879,"y":420,"wires":[]},{"id":"cc7381a4.13aae","type":"change","z":"279b8956.27dfe6","name":"","rules":[{"t":"set","p":"pause","pt":"msg","to":"true","tot":"bool"}],"action":"","property":"","from":"","to":"","reg":false,"x":480,"y":500,"wires":[["54856b75.8323f4"]]},{"id":"d7047f19.d9e27","type":"inject","z":"279b8956.27dfe6","name":"Stop stream","topic":"","payload":"","payloadType":"date","repeat":"","crontab":"","once":false,"onceDelay":0.1,"x":290,"y":460,"wires":[["ece32c55.042c6"]]},{"id":"ece32c55.042c6","type":"change","z":"279b8956.27dfe6","name":"","rules":[{"t":"set","p":"stop","pt":"msg","to":"true","tot":"bool"}],"action":"","property":"","from":"","to":"","reg":false,"x":470,"y":460,"wires":[["54856b75.8323f4"]]},{"id":"54856b75.8323f4","type":"sse-client","z":"279b8956.27dfe6","name":"","url":"https://proxy.streamdata.io/http://stockmarket.streamdata.io/prices/","events":["patch"],"partHeaders":{},"proxy":"","restart":false,"timeout":1,"x":670,"y":420,"wires":[["5dea869b.8d96f8"]]}]
```

The node will be controlled by the input messages it receives:
+ **Start** the stream by sending a message to the node.  The node will send a http request to the server, to subscribe for the specified events.
+ **Stop** the stream by sending a message with `msg.stop = true` to the node.  The connection to the server will be disconnected entirely.  Start the stream again afterwards by sending a new input message, to reconnect again to the server.
+ **Pause** the stream by sending a message with `msg.pause = true` to the node.  The connection to the server will stay open, but the server will be informed that this client doesn't want to receive the specified events anymore.  Resume the stream again afterwards by sending a new input message, so the server will be informed that this client wants to receive the specified events again.

When controlling this node, the node will be in one of the following statusses:

![Statusses](https://raw.githubusercontent.com/bartbutenaers/node-red-contrib-sse-client/master/images/sse_statusses.png)

## Node configuration

### URL
This URL refers to the resource (e.g. php file) on the SSE server, which will be able to respond by pushing SSE events to this client.

### Events
Specify a list of events that needs to be received, i.e. to which this client wants to subscribe.  At least one event name should be specified.  By default the 'message' event is added, but this will vary from stream to stream!  

When an incorrect event name will be specified, ***no events*** will be received in the Node-Red flow (without having an error)!

### Http headers
Optionally http headers can be specified, which will be send to the SSE server in the initial http request.  This can be used for example to send cookies to the server.

### Proxy
Optionally a proxy url can be specified, in case a (corporate) firewall is isolating the Node-Red flow from the SSE server.

### Restart connection after timeout
When this checkbox is selected, a timeout interval (in seconds) can be specified.  When no event is received in that timeout interval, the connection to the SSE server will be disconnected and reconnected again automatically.  

Remark: this option has no effect if the node is being paused! Indeed when the node is paused, no events will be received anyway ...


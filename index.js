import React from 'react'
import ReactDOM from 'react-dom'

const Node = require('libp2p-ipfs-browser').Node
const PeerInfo = require('peer-info')
const PeerId = require('peer-id')
const Multiaddr = require('multiaddr')
const Graph = require('./p2p-graph.js')
const pullToStream = require('pull-stream-to-stream')
require('./style.css')

window.node = Node
window.PeerInfo = PeerInfo
window.PeerId = PeerId

let HOME_ID = 'Starting...'
let CONNECTED_IDS = {}

const PROTOCOL = '/libp2p.io/0.0.1'
const SIGNAL_SERVER = '/libp2p-webrtc-star/ip4/178.62.241.75/tcp/9090/ws/ipfs/:peer-id'

const startOwnPeer = (callback) => {
  PeerId.create((err, peerId) => {
    if (err) callback(err)
    const peerInfo = new PeerInfo(peerId)
    const mh1 = Multiaddr(SIGNAL_SERVER.replace(':peer-id', peerId.toB58String()))
    peerInfo.multiaddr.add(mh1)
    const node = new Node(peerInfo)
    node.start((err) => {
      if (err) callback(err)
      callback(null, node)
    })
  })
}
const listenAndConnectToPeers = (node, callback) => {
  node.discovery.on('peer', (peerInfo) => {
    node.dialByPeerInfo(peerInfo, () => {})
  })
  node.swarm.on('peer-mux-established', (peerInfo) => {
    callback(peerInfo)
  })
  node.swarm.on('peer-mux-closed', (peerInfo) => {

  })
}

class App extends React.Component {
  constructor (props) {
    super(props)
    this.state = {
      node: null,
      myId: '',
      peers: [],
      graph: null
    }
  }
  componentDidMount () {
    const graph = new Graph('#graph')
    window.graph = graph
    this.setState({graph})
    startOwnPeer((err, node) => {
      if (err) throw err
      const myId = node.peerInfo.id.toB58String()
      window.node = node
      this.setState({node, myId})
      listenAndConnectToPeers(node, (peerInfo) => {
        console.log('Connected to one more peer!')
        console.log(peerInfo.id.toB58String())
        const id = peerInfo.id.toB58String()
        graph.add({
          id: id,
          name: id
        })
        graph.connect(myId, id)

        this.setState({peers: this.state.peers.concat([id])})

        node.dialByPeerInfo(peerInfo, PROTOCOL, (err, conn) => {
          if (!err) {
            console.log('Create connection over protocol!')
            console.log(conn)
            const connStream = pullToStream(conn)
            const value = JSON.stringify({
              from: myId,
              peers: node.peerBook.getAll()
            })
            window.connStream = connStream
            connStream.write(new Buffer(value))
            setImmediate(() => connStream.end())
            console.log(connStream)
          }
        })
      })
      graph.add({
        id: myId,
        me: true,
        name: 'You'
      })

      node.handle(PROTOCOL, (protocol, conn) => {
        console.log('Got connection over protocol!')
        console.log(protocol, conn)
        const connStream = pullToStream(conn)
        const peerCollection = []
        connStream.on('data', (data) => {
          peerCollection.push(data.toString())
          console.log('got data')
        })
        connStream.on('end', () => {
          console.log('full')
          const fullCollection = JSON.parse(peerCollection.join(''))
          const fromId = fullCollection.from
          const connectedPeers = Object.keys(fullCollection.peers).filter((id) => {
            console.log(id)
            return myId !== id
          })
          console.log(connectedPeers)
          connectedPeers.forEach((id) => {
            console.log('connect', fromId, 'and', id)
            try {
              this.state.graph.connect(fromId, id)
            } catch (err) {
              // err
            }
          })
          window.remotePeers = fullCollection
        })
        // pull(
        //   p,
        //   conn
        // )

        // pull(
        //   conn,
        //   pull.map((data) => {
        //     return data.toString('utf8').replace('\n', '')
        //   }),
        //   pull.drain(console.log)
        // )

        // process.stdin.setEncoding('utf8')
        // process.openStdin().on('data', (chunk) => {
        //   var data = chunk.toString()
        //   p.push(data)
        // })
      })
    })

    // graph.add({
    //   id: 'peer1',
    //   me: true,
    //   name: 'You'
    // })
    // graph.add({
    //   id: 'peer3',
    //   name: 'Another Peer'
    // })

    // graph.connect('peer2', 'peer3')
  }
  render () {
    // const peers = this.state.peers.map((peer) => {
    //   return <div key={peer}><small>{peer.substr(0, 16)}</small></div>
    // })
    return <div>
      <div id='title'>lib<span id='blue'>p2p</span></div>
      <div id='graph' />
      <div id='you'>
        Your ID:<br />{this.state.myId}
      </div>
    </div>
  }
}

ReactDOM.render(<App id={HOME_ID} peers={CONNECTED_IDS} />, document.getElementById('react-app'))

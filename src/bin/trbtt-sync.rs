use futures::{
    stream::{SplitSink, SplitStream},
    SinkExt,
};
use std::time::Duration;
use std::{collections::HashMap, sync::Arc};
use tokio::sync::Mutex;

use anyhow::Context;

use futures_util::StreamExt;

use timetrackrs::sync::{MsgKind, PeerMsg};
use tungstenite::Message;
use uuid::Uuid;

use tokio::spawn;
use tokio_tungstenite::{connect_async, MaybeTlsStream, WebSocketStream};

use datachannel::{
    DataChannelHandler, DataChannelInit, IceCandidate, PeerConnectionHandler, Reliability,
    RtcConfig, RtcDataChannel, RtcPeerConnection, SdpType, SessionDescription,
};

// Server part

#[derive(Clone)]
enum Mode {
    Master,
    Slave,
}
#[derive(Clone)]
struct TrbttSyncConn {
    my_id: Uuid,
    their_id: Uuid,
    mode: Mode,
}

impl DataChannelHandler for TrbttSyncConn {
    fn on_open(&mut self) {
        println!("on_open");
        // start sending stuff if client?
    }

    fn on_message(&mut self, msg: &[u8]) {
        let msg = String::from_utf8_lossy(msg).to_string();
        println!("on_message({})", msg);
    }
}

type SignallingOut =
    Arc<Mutex<SplitSink<WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>, Message>>>;
type SignallingIn = Arc<Mutex<SplitStream<WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>>>>;
struct WsConn {
    peer_id: Uuid,
    dest_id: Uuid,
    signaling: SignallingOut,
    dc: Option<Box<RtcDataChannel<TrbttSyncConn>>>,
}

impl WsConn {
    fn new(peer_id: Uuid, dest_id: Uuid, signaling: SignallingOut) -> Self {
        WsConn {
            peer_id,
            dest_id,
            signaling,
            dc: None,
        }
    }
}

impl PeerConnectionHandler for WsConn {
    type DCH = TrbttSyncConn;

    fn data_channel_handler(&mut self) -> Self::DCH {
        TrbttSyncConn {
            my_id: self.peer_id,
            their_id: self.dest_id,
            mode: Mode::Slave,
        }
    }

    fn on_description(&mut self, sess_desc: SessionDescription) {
        let peer_msg = PeerMsg {
            dest_id: self.dest_id,
            kind: MsgKind::Description(sess_desc),
        };

        let signalling = self.signaling.clone();

        println!("blocking on desc");
        std::thread::spawn(move || {
            tokio::runtime::Builder::new_current_thread()
                .build()
                .unwrap()
                .block_on(async move {
                    signalling
                        .lock()
                        .await
                        .send(Message::binary(serde_json::to_vec(&peer_msg).unwrap()))
                        .await
                })
                .unwrap();
        });
        println!("desc done");
    }

    fn on_candidate(&mut self, cand: IceCandidate) {
        let peer_msg = PeerMsg {
            dest_id: self.dest_id,
            kind: MsgKind::Candidate(cand),
        };
        let signalling = self.signaling.clone();

        std::thread::spawn(move || {
            tokio::runtime::Builder::new_current_thread()
                .build()
                .unwrap()
                .block_on(async move {
                    signalling
                        .lock()
                        .await
                        .send(Message::binary(serde_json::to_vec(&peer_msg).unwrap()))
                        .await
                })
        });
    }

    fn on_data_channel(&mut self, mut dc: Box<RtcDataChannel<TrbttSyncConn>>) {
        log::info!(
            "Received Datachannel with: label={}, protocol={:?}, reliability={:?}",
            dc.label(),
            dc.protocol(),
            dc.reliability()
        );

        dc.send(format!("Hello from {}", self.peer_id).as_bytes())
            .ok();
        self.dc.replace(dc);
    }
}

type ConnectionMap = Arc<Mutex<HashMap<Uuid, Box<RtcPeerConnection<WsConn>>>>>;
type ChannelMap = Arc<Mutex<HashMap<Uuid, Box<RtcDataChannel<TrbttSyncConn>>>>>;

struct SyncClient {
    conf: RtcConfig,
    conns: ConnectionMap,
    chans: ChannelMap,
    own_id: Uuid,
    signalling_out: Option<SignallingOut>,
    signalling_in: Option<SignallingIn>,
}
impl SyncClient {
    fn new(own_id: Uuid) -> SyncClient {
        SyncClient {
            conf: RtcConfig::new(&["stun:stun.l.google.com:19302"]),
            conns: ConnectionMap::new(Mutex::new(HashMap::new())),
            chans: ChannelMap::new(Mutex::new(HashMap::new())),
            own_id,
            signalling_in: None,
            signalling_out: None,
        }
    }
    async fn establish_signalling(&mut self) -> anyhow::Result<()> {
        let url = format!("ws://116.203.43.199:48749/{:?}", self.own_id);
        // let url = format!("ws://127.0.0.1:48749/{:?}", peer_id);
        let (ws_stream, _) = connect_async(url)
            .await
            .context("Failed to connect to websocket server")?;

        let (a, b) = ws_stream.split();

        self.signalling_in = Some(Arc::new(Mutex::new(b)));
        self.signalling_out = Some(Arc::new(Mutex::new(a)));

        let conns = self.conns.clone();

        let conf = self.conf.clone();
        let own_id = self.own_id;
        let from_signalling_server = self.signalling_in.as_ref().unwrap().clone();

        let to_signalling_server = self.signalling_out.as_ref().unwrap().clone();

        let receive = async move {
            while let Some(Ok(msg)) = from_signalling_server.lock().await.next().await {
                let peer_msg = match serde_json::from_slice::<PeerMsg>(&msg.into_data()) {
                    Ok(peer_msg) => peer_msg,
                    Err(err) => {
                        log::error!("Invalid PeerMsg: {}", err);
                        continue;
                    }
                };
                let dest_id = peer_msg.dest_id;

                let mut locked = conns.lock().await;
                let pc = match locked.get_mut(&dest_id) {
                    Some(pc) => pc,
                    None => match &peer_msg.kind {
                        MsgKind::Description(SessionDescription {
                            sdp_type: SdpType::Offer,
                            ..
                        }) => {
                            log::info!("Client {:?} answering to {:?}", &own_id, &dest_id);

                            let conn = WsConn::new(own_id, dest_id, to_signalling_server.clone());
                            let pc = RtcPeerConnection::new(&conf, conn).unwrap();

                            locked.insert(dest_id, pc);
                            locked.get_mut(&dest_id).unwrap()
                        }
                        _ => {
                            log::warn!("Peer {} not found in client", &dest_id);
                            continue;
                        }
                    },
                };

                match &peer_msg.kind {
                    MsgKind::Description(sess_desc) => pc.set_remote_description(sess_desc).ok(),
                    MsgKind::Candidate(cand) => pc.add_remote_candidate(cand).ok(),
                };
            }
        };
        spawn(receive);
        //receive.await;
        Ok(())
    }
    async fn try_connect(&self, dest_id: Uuid) {
        log::info!("Peer {:?} sends data", self.own_id);

        let conn = WsConn::new(
            self.own_id,
            dest_id,
            self.signalling_out.as_ref().unwrap().clone(),
        );

        let pipe = TrbttSyncConn {
            my_id: conn.peer_id,
            their_id: conn.dest_id,
            mode: Mode::Master,
        };
        let mut map = self.conns.lock().await;
        let pc = {
            let entry = map.entry(dest_id);
            use std::collections::hash_map::Entry::*;
            match entry {
                Vacant(v) => v.insert(RtcPeerConnection::new(&self.conf, conn).unwrap()),
                Occupied(_) => panic!("alreday have conn!??"),
            }
        };

        let opts = DataChannelInit::default()
            .protocol("prototest")
            .reliability(Reliability::default());

        let dc = pc.create_data_channel_ex("sender", pipe, &opts).unwrap();
        self.chans.lock().await.insert(dest_id, dc);
        println!("conn estab (i guess)");
    }
}

// TODO: make and verify dtls certificate

async fn go() -> anyhow::Result<()> {
    timetrackrs::util::init_logging();

    let id1 = Uuid::new_v4();
    let id2 = Uuid::new_v4();

    let mut sync_client1 = SyncClient::new(id1);

    let mut sync_client2 = SyncClient::new(id2);
    sync_client1.establish_signalling().await?;
    sync_client2.establish_signalling().await?;
    println!("signalling established");
    sync_client1.try_connect(id2).await;

    tokio::time::sleep(Duration::from_secs(10)).await;

    /*let (tx_res, rx_res) = chan::unbounded();
    let (tx_id, rx_id) = chan::bounded(2);

    spawn(run_client(id1, rx_id.clone(), tx_res.clone()));
    spawn(run_client(id2, rx_id.clone(), tx_res.clone()));

    let mut expected = HashSet::new();
    expected.insert(format!("Hello from {:?}", id1));
    expected.insert(format!("Hello from {:?}", id2));

    tx_id.try_send(id1).unwrap();
    tx_id.try_send(id1).unwrap();

    let mut res = HashSet::new();
    let r1 = timeout(Duration::from_secs(5), rx_res.recv()).await;
    let r2 = timeout(Duration::from_secs(5), rx_res.recv()).await;
    res.insert(r1.unwrap().unwrap());
    res.insert(r2.unwrap().unwrap());

    assert_eq!(expected, res);*/
    Ok(())
}
fn main() -> anyhow::Result<()> {
    tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
        .context("building tokio runtime")?
        .block_on(go())?;
    Ok(())
}

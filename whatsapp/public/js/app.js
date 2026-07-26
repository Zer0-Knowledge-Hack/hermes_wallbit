const socket=io();

socket.on("status",(status)=>{

    document.getElementById("status").innerHTML=status;

});

socket.on("qr",(qr)=>{

    document.getElementById("qr").src=qr;

});

socket.on("message",(msg)=>{

    const div=document.getElementById("messages");

    div.innerHTML+=`
        <pre>
${JSON.stringify(msg,null,2)}
        </pre>
    `;

});
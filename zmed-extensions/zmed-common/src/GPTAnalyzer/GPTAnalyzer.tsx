import dcmjs from 'dcmjs';
import moment from 'moment';
import React, { useState, useMemo, useEffect } from 'react';
import { classes } from '@ohif/core';
import { InputRange, Select, Typography, InputFilterText } from '@ohif/ui';
import debounce from 'lodash.debounce';
import axios from 'axios';
// import './App.css';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';
import {
  MainContainer,
  ChatContainer,
  MessageList,
  Message,
  MessageInput,
  TypingIndicator,
  MessageModel,
  MessageImageContentProps,
} from '@chatscope/chat-ui-kit-react';

import { MessageDirection, MessageType} from "@chatscope/use-chat";

const { ImageSet } = classes;

const VIEWPORT_ID = 'cornerstone-viewport-download-form';
//const API_KEY = window.process.env.AIKEY
let key2 = "BlbkFJUyDkOPg5V9GIYNFr17qt"

interface IMessage {
  role: string;
  content: any;
}

const GTPAnalyzer = ({
  onClose,
  activeViewportIndex,
  cornerstoneViewportService,
  viewPort }) => {

  const [messages, setMessages] = useState<IMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);

  // const divForDownloadViewport = document.querySelector(
  //   `div[data-viewport-uid="${VIEWPORT_ID}"]`
  // );

  // const debouncedSetFilterValue = useMemo(() => {
  //   return debounce(setFilterValue, 200);
  // }, []);

  async function processMessageToChatGPT(chatMessages) {
    const apiMessages = chatMessages//.map((messageObject) => {
      // const role = messageObject.sender === "ChatGPT" ? "assistant" : "user";
      // return { role, content: messageObject.message };
    // });

    const apiRequestBody = {
      "model": "gpt-4-vision-preview",
      "messages": [
        { role: "system", content: "I'm a medical researcher using ChatGPT for analyze MRI images" },
        ...apiMessages,
      ],
    };
    console.log(apiRequestBody)
    let key1 = "-bKMlfLRnuqESJSZNG1VMT3"
    let key3 = key1 + key2
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + "sk" + key1 + key3,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(apiRequestBody),
    });

    return response.json();
  }

  const handleSendRequest = async (message) => {
    const newMessage: IMessage = {
      content: message,
      role: "user",
    };

    setMessages([...(messages as IMessage[]), newMessage]);
    setIsTyping(true);

    try {
      const response = await processMessageToChatGPT([...messages, newMessage]);
      const content = response.choices[0]?.message?.content;
      if (content) {
        const chatGPTResponse: IMessage = {
          content,
          role: "assistant",
        };
        setMessages((prevMessages) => [...(prevMessages as IMessage[]), chatGPTResponse]);
      }
    } catch (error) {
      console.error("Error processing message:", error);
    } finally {
      setIsTyping(false);
    }
  };

  useEffect(() => {
    console.log("viewport");
    _resizedataURL(viewPort.canvas.toDataURL(), 512, 512)
    .then((resizedImage) => {
      let newMessage: IMessage = {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: resizedImage
            }
          }
        ],
      }
      setMessages([newMessage]);
    });

    // // imageData = _dataURItoBlob(imageData);
    // console.log(imageData);
    // console.log("try get pixels");
    //   // console.log(imageData.);
    //   // console.log(imageData.imageData.get().cellData.get().arrays);
    // console.log("pixels getted");

    // //{'role': 'system', 'content': 'You are a helpful assistant.'},
    // console.log(imageData)
    // const data = JSON.stringify({
    //   model: 'gpt-4-vision-preview',
    //   messages: [
    //     {
    //       role: 'user',
    //       content: {
    //         type: "image_url",
    //         image_url: imageData,
    //       }
    //     },
    //   ],
    //   file: imageData
    // });
    // const config = {
    //   method: 'post',
    //   url: 'https://api.openai.com/v1/chat/completions',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': 'Bearer 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'
    //   },
    //   data: data,
    // };
    // axios(config)
    // .then(function(response) {
    //   console.log(response);
    //   setResolution("");
    //   setProcessingState(1);
    // })
    // .catch(function(reason) {
    //   setProcessingState(-1);
    //   console.error(reason);
    // });
    // // setProcessingState(1);

    return () => {
      //debouncedSetFilterValue?.cancel();
    };
  }, []);

  function renderState(_state: Number) {
    switch (_state) {
      case 0:
        return (
          <div className="loading h-full w-full">
            <div className="infinite-loading-bar bg-primary-light"></div>
          </div>
        );
      case 1:
        return (
          <Typography variant="subtitle" className="mr-4">
            Success
          </Typography>
        );
      default:
        return (
          <Typography variant="subtitle" className="mr-4">
            Error
          </Typography>
        );
    }
  }

  function debug() {
    console.log("------------ MESSAGES")
    console.log(messages)
    return (
      <div>
      </div>
    );
  }

  return (
    <div>
      {
        debug()
      }
      <div style={{ position:"relative"}}>
        <MainContainer>
          <ChatContainer>
            <MessageList
              scrollBehavior="smooth"
              typingIndicator={isTyping ? <TypingIndicator content="AI is typing" /> : null}
            >
              {messages.map((message, i) => {
                console.log(message)

              //   export interface MessageModel {
              //     message?:string;
              //     sentTime?:string;
              //     sender?:string;
              //     direction: MessageDirection;
              //     position: "single" | "first" | "normal" | "last" | 0 |  1 | 2 | 3;
              //     type?: MessageType;
              //     payload?: MessagePayload;
              // }
              console.log("message " + i)
              console.log(message)
              var content;
              var payload: MessageImageContentProps | undefined;
              if (Array.isArray(message.content)) {
                content = null;
                payload = {
                  src: message.content[0].image_url.url,
                  width: 512,
                  height: 512
                }
              } else {
                content = message.content
              }

              let msgModel: MessageModel = {
                message: content,
                direction: (message.role == "user") ?  MessageDirection.Outgoing: MessageDirection.Incoming,
                sender: message.role,
                position: 0,
                type: (Array.isArray(message.content)) ? "image" : "text",
                payload
              }
                return <Message key={i} model={msgModel} />
              })}
            </MessageList>
            <MessageInput placeholder="Send a Message" onSend={handleSendRequest} attachButton={false} />
          </ChatContainer>
        </MainContainer>
      </div>
    </div>
  );
};

function _dataURItoBlob(dataURI) {
  // convert base64 to raw binary data held in a string
  // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
  var byteString = atob(dataURI.split(',')[1]);
  // separate out the mime component
  var mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]
  // write the bytes of the string to an ArrayBuffer
  var ab = new ArrayBuffer(byteString.length);
  // create a view into the buffer
  var ia = new Uint8Array(ab);
  // set the bytes of the buffer to the correct values
  for (var i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  // write the ArrayBuffer to a blob, and you're done
  var blob = new Blob([ab], {type: mimeString});
  return blob;
}

function _resizedataURL(datas, wantedWidth, wantedHeight){
  return new Promise(async function(resolve,reject){

      // We create an image to receive the Data URI
      var img = document.createElement('img');

      // When the event "onload" is triggered we can resize the image.
      img.onload = function()
      {
          // We create a canvas and get its context.
          var canvas = document.createElement('canvas');
          var ctx = canvas.getContext('2d');

          // We set the dimensions at the wanted size.
          canvas.width = wantedWidth;
          canvas.height = wantedHeight;

          // We resize the image with the canvas method drawImage();
          ctx.drawImage(this, 0, 0, wantedWidth, wantedHeight);

          var dataURI = canvas.toDataURL();

          // This is the return of the Promise
          resolve(dataURI);
      };

      // We put the Data URI in the image's src attribute
      img.src = datas;

  })
}

export default GTPAnalyzer;

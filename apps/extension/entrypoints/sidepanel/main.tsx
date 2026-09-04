import React from 'react'
import { createRoot } from 'react-dom/client'
import { tokensCss } from '@dalili/core'
import './sidepanel.css'
import { App } from './App'

const tokenStyle = document.createElement('style')
tokenStyle.textContent = tokensCss(':root')
document.head.appendChild(tokenStyle)

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

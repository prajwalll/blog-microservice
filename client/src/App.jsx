import "./App.css";
import PostCreate from "./PostCreate";
import PostList from "./PostList";

function App() {
  return (
    <div>
      <h3>Create Post</h3>
      <PostCreate />
      <hr />
      <PostList />
    </div>
  );
}

export default App;
